# Workflow Options - Quick Reference

## Two Ways to Start

### Option 1: Start with Real Shoe Data 👟

```
1. Sidebar → "1. Load Dataset" → Set number of images → Click "Load Dataset"
2. Sidebar → "2. Compute Embeddings" → Click "Extract CLIP Embeddings"
3. Sidebar → "3. Create UMAP Projection" → Click "Create UMAP"
4. ✅ See visualization of real Zappos shoes
5. (Optional) Initialize Generator and add AI variations
```

**Best for:**

- Exploring real shoe design patterns
- Understanding semantic organization of footwear
- Adding AI variations to real shoes

---

### Option 2: Start with AI Generation 🎨

```
1. Sidebar → "🎨 Generation Workflow" → Click "Initialize Generator" (wait ~30s)
2. Mode: "Initial batch" → Enter prompt → Click "Generate Batch"
3. ✅ See visualization of generated shoes (UMAP created automatically!)
4. Use other generation modes to refine/explore
5. (Optional) Load Zappos dataset later to compare
```

**Best for:**

- Exploring AI-generated designs from scratch
- Rapid prototyping without loading large datasets
- Iterative design refinement

---

## Hybrid Workflow: Best of Both Worlds 🚀

```
1. Start with Option 1 (load Zappos dataset)
2. Explore real shoes and identify interesting regions
3. Initialize Generator
4. Use "From reference + text" to create variations of real shoes
5. Compare AI-generated vs. real shoes in semantic space
```

**Example:**

```
1. Load 200 Zappos shoes
2. Find a sporty sneaker you like (index 42)
3. Generate from reference: "more premium, luxury materials"
4. See how AI interpretation compares to real premium shoes
```

---

## What You Saw (Your Case)

From your terminal output:

```
- Pipelines loaded successfully!  ✅
- Generated 7 images (20 inference steps each)  ✅
- CLIP embeddings extracted  ✅
- UMAP projection created (7, 2)  ✅
```

**Issue:** The visualization wasn't showing because the UI logic was checking for `dataset_loaded` before showing the plot.

**Fix Applied:** Now the app shows visualization as soon as `embeddings_computed` is True, regardless of whether you started with dataset or generation.

---

## After the Fix - What to Expect

### Generation-Only Start:

1. Initialize Generator
2. Generate Batch (e.g., 12 images, prompt: "sporty premium sneaker")
3. **Visualization appears automatically** showing your 12 generated shoes in semantic space
4. Use other modes to refine: reference + text, interpolation
5. Generation History panel shows all iterations

### Dataset + Generation:

1. Load Zappos (e.g., 200 shoes)
2. Extract embeddings, create UMAP
3. See visualization of real shoes
4. Initialize Generator
5. Generate variations - they appear in the same space as real shoes
6. Compare AI vs. real in semantic space

---

## Quick Troubleshooting

**Q: I generated images but see no visualization**

- Check if the app reloaded after generation
- Look for "🗺️ Semantic Latent Space" heading - if missing, try clicking the generate button again
- With the fix, this should now work!

**Q: Can I add real shoes after generating AI shoes?**

- Yes! Load dataset anytime, it will be added to the space
- However, this will require re-running UMAP on the combined data

**Q: Which workflow is faster?**

- **Generation-only:** Faster to start (no loading thousands of images)
- **Dataset-first:** More context, better for understanding real shoe patterns

**Q: Can I generate variations of Zappos shoes?**

- Yes! Load dataset first, then use "From reference + text" mode
- Enter the index of any Zappos shoe and add your prompt

---

## Recommended Demo Flow

For a 5-minute demo showing the power of semantic-guided generation:

```
1. Start fresh (Option 2 - Generation only)
2. Generate batch: "sporty sneaker design" (12 images)
3. Show semantic organization in space
4. Pick most sporty one (e.g., index 2)
5. Generate from reference: "more premium, luxury materials"
6. Show it moves toward premium region
7. Generate from reference again: "add elegant details"
8. Show the progression in Generation History
9. Explain: "This is intentional navigation vs. random prompt iteration"
```

**Key message:** The semantic space provides **context** that makes exploration **intentional** rather than random.
