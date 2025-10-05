from diffusers import StableDiffusionPipeline, StableDiffusionImg2ImgPipeline
import torch

print("Loading Stable Diffusion 1.5 from cache...")

# Use variant parameter for fp16
txt2img_pipe = StableDiffusionPipeline.from_pretrained(
    "runwayml/stable-diffusion-v1-5",
    torch_dtype=torch.float16,
    variant="fp16",
    use_safetensors=True
)

img2img_pipe = StableDiffusionImg2ImgPipeline.from_pretrained(
    "runwayml/stable-diffusion-v1-5", 
    torch_dtype=torch.float16,
    variant="fp16",
    use_safetensors=True
)

print("Models loaded successfully!")