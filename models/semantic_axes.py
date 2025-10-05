"""Semantic axis construction using CLIP text and human annotations."""

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.svm import SVC
from sklearn.decomposition import PCA
from typing import List, Dict, Tuple, Optional, Union
import pandas as pd
from dataclasses import dataclass

from config import ZAPPOS_ATTRIBUTES
from models.embeddings import CLIPEmbedder

@dataclass
class SemanticAxis:
    """Represents a semantic axis in embedding space."""
    name: str
    direction: np.ndarray
    positive_concept: str
    negative_concept: str
    method: str  # 'clip_text', 'supervised', 'pca'
    strength: float = 1.0
    
    def project(self, embeddings: np.ndarray) -> np.ndarray:
        """Project embeddings onto this semantic axis."""
        # Ensure direction is normalized
        direction_norm = self.direction / np.linalg.norm(self.direction)
        
        # Project embeddings
        projections = np.dot(embeddings, direction_norm) * self.strength
        return projections
    
    def get_extreme_indices(self, embeddings: np.ndarray, n_extreme: int = 10) -> Tuple[List[int], List[int]]:
        """Get indices of most positive and negative examples along this axis."""
        projections = self.project(embeddings)
        
        # Most positive (high values)
        positive_indices = np.argsort(projections)[-n_extreme:].tolist()
        
        # Most negative (low values) 
        negative_indices = np.argsort(projections)[:n_extreme].tolist()
        
        return positive_indices, negative_indices

class SemanticAxisBuilder:
    """Builds semantic axes using various methods."""
    
    def __init__(self, embedder: Optional[CLIPEmbedder] = None):
        self.embedder = embedder or CLIPEmbedder()
        self.axes: Dict[str, SemanticAxis] = {}
    
    def create_clip_text_axis(
        self, 
        positive_concept: str, 
        negative_concept: str,
        axis_name: Optional[str] = None
    ) -> SemanticAxis:
        """Create semantic axis using CLIP text embeddings."""
        
        axis_name = axis_name or f"{positive_concept}_vs_{negative_concept}"
        
        print(f"Creating CLIP text axis: {positive_concept} <-> {negative_concept}")
        
        # Extract text embeddings
        text_embeddings = self.embedder.extract_text_embeddings([positive_concept, negative_concept])
        
        # Compute semantic direction
        direction = text_embeddings[0] - text_embeddings[1]
        
        axis = SemanticAxis(
            name=axis_name,
            direction=direction,
            positive_concept=positive_concept,
            negative_concept=negative_concept,
            method='clip_text'
        )
        
        self.axes[axis_name] = axis
        return axis
    
    def create_supervised_axis(
        self,
        embeddings: np.ndarray,
        labels: np.ndarray,
        axis_name: str,
        positive_concept: str = "positive",
        negative_concept: str = "negative",
        method: str = 'logistic'
    ) -> SemanticAxis:
        """Create semantic axis using supervised learning on human labels."""
        
        print(f"Creating supervised axis '{axis_name}' with {method}")
        
        # Filter out neutral labels if any (assuming 0 = negative, 1 = positive)
        valid_mask = (labels == 0) | (labels == 1)
        filtered_embeddings = embeddings[valid_mask]
        filtered_labels = labels[valid_mask]
        
        if len(filtered_labels) < 10:
            print(f"Warning: Only {len(filtered_labels)} labeled examples for axis '{axis_name}'")
        
        # Train classifier
        if method == 'logistic':
            classifier = LogisticRegression(random_state=42, max_iter=1000)
        elif method == 'svm':
            classifier = SVC(kernel='linear', random_state=42)
        else:
            raise ValueError(f"Unknown method: {method}")
        
        classifier.fit(filtered_embeddings, filtered_labels)
        
        # Extract direction from classifier weights
        if hasattr(classifier, 'coef_'):
            direction = classifier.coef_[0]
        else:
            raise ValueError(f"Classifier {method} doesn't have accessible weights")
        
        axis = SemanticAxis(
            name=axis_name,
            direction=direction,
            positive_concept=positive_concept,
            negative_concept=negative_concept,
            method='supervised'
        )
        
        self.axes[axis_name] = axis
        return axis
    
    def create_pca_axis(
        self,
        embeddings: np.ndarray,
        axis_name: str,
        component_idx: int = 0
    ) -> SemanticAxis:
        """Create semantic axis using PCA component."""
        
        print(f"Creating PCA axis '{axis_name}' using component {component_idx}")
        
        # Fit PCA
        pca = PCA(n_components=min(10, embeddings.shape[1]))
        pca.fit(embeddings)
        
        # Get the specified component as direction
        direction = pca.components_[component_idx]
        
        axis = SemanticAxis(
            name=axis_name,
            direction=direction,
            positive_concept=f"PC{component_idx}+",
            negative_concept=f"PC{component_idx}-",
            method='pca'
        )
        
        self.axes[axis_name] = axis
        return axis
    
    def create_zappos_attribute_axes(
        self,
        embeddings: np.ndarray,
        image_paths: List[str],
        zappos_labels_df: Optional[pd.DataFrame] = None
    ) -> Dict[str, SemanticAxis]:
        """Create semantic axes for Zappos attributes using existing human labels."""
        
        if zappos_labels_df is None:
            print("No Zappos labels provided, creating CLIP text axes instead")
            return self._create_clip_zappos_axes()
        
        axes = {}
        
        for attr_id, attr_name in ZAPPOS_ATTRIBUTES.items():
            try:
                # Extract labels for this attribute
                attr_labels = self._extract_zappos_labels(zappos_labels_df, attr_id, image_paths)
                
                if attr_labels is not None and len(attr_labels) > 0:
                    axis = self.create_supervised_axis(
                        embeddings=embeddings,
                        labels=attr_labels,
                        axis_name=attr_name,
                        positive_concept=f"more {attr_name}",
                        negative_concept=f"less {attr_name}"
                    )
                    axes[attr_name] = axis
                else:
                    print(f"No labels found for attribute '{attr_name}', using CLIP text axis")
                    axis = self.create_clip_text_axis(
                        positive_concept=f"{attr_name} shoe",
                        negative_concept=f"not {attr_name} shoe",
                        axis_name=attr_name
                    )
                    axes[attr_name] = axis
                    
            except Exception as e:
                print(f"Error creating axis for '{attr_name}': {e}")
                continue
        
        return axes
    
    def _create_clip_zappos_axes(self) -> Dict[str, SemanticAxis]:
        """Fallback: create CLIP text axes for Zappos attributes."""
        
        clip_concepts = {
            "open": ("open toe shoe", "closed toe shoe"),
            "pointy": ("pointy toe shoe", "rounded toe shoe"), 
            "sporty": ("sporty athletic shoe", "formal dress shoe"),
            "comfort": ("comfortable casual shoe", "stiff formal shoe")
        }
        
        axes = {}
        for attr_name, (pos_concept, neg_concept) in clip_concepts.items():
            axis = self.create_clip_text_axis(pos_concept, neg_concept, attr_name)
            axes[attr_name] = axis
        
        return axes
    
    def _extract_zappos_labels(
        self, 
        labels_df: pd.DataFrame, 
        attribute_id: int, 
        image_paths: List[str]
    ) -> Optional[np.ndarray]:
        """Extract binary labels for a specific Zappos attribute."""
        # This is a placeholder - you'd need to implement the actual logic
        # to match image paths with the Zappos label format
        # The labels_df would come from loading zappos-labels.mat
        
        print(f"Extracting labels for attribute {attribute_id} - this needs implementation")
        return None
    
    def get_axis(self, name: str) -> Optional[SemanticAxis]:
        """Get a semantic axis by name."""
        return self.axes.get(name)
    
    def list_axes(self) -> List[str]:
        """List all available axis names."""
        return list(self.axes.keys())
    
    def project_all_axes(self, embeddings: np.ndarray) -> Dict[str, np.ndarray]:
        """Project embeddings onto all available axes."""
        projections = {}
        
        for name, axis in self.axes.items():
            projections[name] = axis.project(embeddings)
        
        return projections

def create_default_axes(embeddings: np.ndarray) -> Dict[str, SemanticAxis]:
    """Create a set of default semantic axes for shoe exploration."""
    
    builder = SemanticAxisBuilder()
    
    # Create CLIP text axes for common shoe concepts
    axes = {}
    
    # Style axes
    axes['sporty'] = builder.create_clip_text_axis(
        "sporty athletic sneaker", "formal dress shoe", "sporty_vs_formal"
    )
    
    axes['casual'] = builder.create_clip_text_axis(
        "casual everyday shoe", "formal business shoe", "casual_vs_formal"
    )
    
    # Shape axes
    axes['pointy'] = builder.create_clip_text_axis(
        "pointed toe shoe", "rounded toe shoe", "pointy_vs_rounded"
    )
    
    axes['open'] = builder.create_clip_text_axis(
        "open toe sandal", "closed toe shoe", "open_vs_closed"
    )
    
    # Function axes
    axes['comfort'] = builder.create_clip_text_axis(
        "comfortable walking shoe", "stiff dress shoe", "comfort_vs_stiff"
    )
    
    # Color axes
    axes['dark'] = builder.create_clip_text_axis(
        "dark black shoe", "light white shoe", "dark_vs_light"
    )
    
    return axes

if __name__ == "__main__":
    # Test semantic axis creation
    print("Testing Semantic Axis Builder...")
    
    # Create some dummy embeddings for testing
    np.random.seed(42)
    test_embeddings = np.random.randn(100, 512)
    test_embeddings = test_embeddings / np.linalg.norm(test_embeddings, axis=1, keepdims=True)
    
    # Test CLIP text axis
    builder = SemanticAxisBuilder()
    
    sporty_axis = builder.create_clip_text_axis("sporty sneaker", "formal shoe")
    print(f"Created axis: {sporty_axis.name}")
    
    # Test projection
    projections = sporty_axis.project(test_embeddings)
    print(f"Projection shape: {projections.shape}")
    print(f"Projection range: {projections.min():.3f} to {projections.max():.3f}")
    
    # Test extreme finding
    pos_idx, neg_idx = sporty_axis.get_extreme_indices(test_embeddings, n_extreme=5)
    print(f"Most sporty indices: {pos_idx}")
    print(f"Most formal indices: {neg_idx}")
    
    # Test default axes creation
    default_axes = create_default_axes(test_embeddings)
    print(f"Created {len(default_axes)} default axes: {list(default_axes.keys())}")