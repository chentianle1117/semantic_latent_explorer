"""Setup script for Zappos Semantic Explorer."""

from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="zappos-semantic-explorer",
    version="0.1.0",
    author="Research Project",
    description="Interactive semantic latent space exploration for footwear images",
    long_description=long_description,
    long_description_content_type="text/markdown",
    packages=find_packages(),
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Science/Research",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
    ],
    python_requires=">=3.8",
    install_requires=[
        "streamlit>=1.28.0",
        "plotly>=5.17.0",
        "umap-learn>=0.5.4",
        "open-clip-torch>=2.20.0",
        "torch>=2.0.1",
        "torchvision>=0.15.2",
        "scikit-learn>=1.3.0",
        "numpy>=1.24.3",
        "pandas>=2.0.3",
        "Pillow>=10.0.0",
        "opencv-python>=4.8.1.78",
        "scipy>=1.11.0",
        "matplotlib>=3.7.2",
        "seaborn>=0.12.2",
        "tqdm>=4.66.0",
    ],
    extras_require={
        "dev": [
            "pytest>=7.0.0",
            "black>=23.0.0",
            "flake8>=6.0.0",
            "isort>=5.12.0",
        ],
    },
    entry_points={
        "console_scripts": [
            "zappos-explorer=app:main",
        ],
    },
)