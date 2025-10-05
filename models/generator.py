"""Stable Diffusion generation integrated with CLIP embeddings."""

import torch
from diffusers import StableDiffusionPipeline, StableDiffusionImg2ImgPipeline
from PIL import Image
import numpy as np
from typing import Optional, List
import time

class SemanticGenerator:
    """Handles image generation using Stable Diffusion with semantic integration."""
    
    def __init__(self, device='cuda'):
        self.device = device
        
        # Load pipelines
        print("Loading Stable Diffusion pipelines...")
        self.txt2img_pipe = StableDiffusionPipeline.from_pretrained(
            "runwayml/stable-diffusion-v1-5",
            torch_dtype=torch.float16,
            safety_checker=None
        ).to(device)
        
        self.img2img_pipe = StableDiffusionImg2ImgPipeline.from_pretrained(
            "runwayml/stable-diffusion-v1-5",
            torch_dtype=torch.float16,
            safety_checker=None
        ).to(device)
        
        # Enable memory optimizations
        self.txt2img_pipe.enable_attention_slicing()
        self.img2img_pipe.enable_attention_slicing()
        
        print("Pipelines loaded successfully!")
    
    def generate_from_text(self, prompt: str, negative_prompt: str = "blurry, low quality") -> Image.Image:
        """Generate image from text prompt.
        
        Args:
            prompt: Text description of desired image
            negative_prompt: What to avoid in generation
            
        Returns:
            Generated PIL Image
        """
        result = self.txt2img_pipe(
            prompt=prompt,
            negative_prompt=negative_prompt,
            num_inference_steps=20,
            guidance_scale=7.5,
            width=512,
            height=512
        )
        return result.images[0]
    
    def generate_from_reference(self, 
                                reference_img: Image.Image, 
                                prompt: str,
                                strength: float = 0.65) -> Image.Image:
        """Generate using reference image + text prompt.
        
        Args:
            reference_img: Reference PIL Image
            prompt: Additional text description
            strength: How much to change (0.5-0.8 good range)
            
        Returns:
            Generated PIL Image
        """
        # Ensure reference is correct size
        reference_img = reference_img.resize((512, 512))
        
        result = self.img2img_pipe(
            prompt=prompt,
            image=reference_img,
            strength=strength,
            num_inference_steps=20,
            guidance_scale=7.5
        )
        return result.images[0]
    
    def generate_interpolated(self, 
                             img_a: Image.Image, 
                             img_b: Image.Image,
                             alpha: float = 0.5,
                             prompt: str = "") -> Image.Image:
        """Generate from interpolated images.
        
        Args:
            img_a: First PIL Image
            img_b: Second PIL Image
            alpha: Blend factor (0=all A, 1=all B)
            prompt: Optional text guidance
            
        Returns:
            Generated PIL Image
        """
        # Simple pixel blend as starting point
        img_a_array = np.array(img_a.resize((512, 512)))
        img_b_array = np.array(img_b.resize((512, 512)))
        
        blended_array = ((1 - alpha) * img_a_array + alpha * img_b_array).astype('uint8')
        blended_img = Image.fromarray(blended_array)
        
        # Generate from blended reference
        result = self.img2img_pipe(
            prompt=prompt if prompt else "high quality shoe design",
            image=blended_img,
            strength=0.55,  # Lower strength to preserve blend
            num_inference_steps=20,
            guidance_scale=7.5
        )
        return result.images[0]
    
    def batch_generate(self, prompt: str, n_images: int = 16) -> List[Image.Image]:
        """Generate multiple images from same prompt.
        
        Args:
            prompt: Text description
            n_images: Number of images to generate
            
        Returns:
            List of generated PIL Images
        """
        images = []
        for i in range(n_images):
            img = self.generate_from_text(prompt)
            images.append(img)
        return images


