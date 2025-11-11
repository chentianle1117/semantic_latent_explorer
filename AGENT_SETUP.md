# AI Agent Integration - Setup & Usage Guide

## Overview
This implementation adds an AI-powered design exploration agent to your semantic canvas application. The agent uses Google's Gemini 2.0 Flash to understand design goals and suggest exploration strategies.

## Features Implemented

### 1. Backend (Python/FastAPI)
- **Canvas Digest Endpoint** (`/api/canvas-digest`): Creates k-means clusters summary of canvas
- **Initial Prompts Endpoint** (`/api/agent/initial-prompts`): Generates 3 diverse starter prompts from a design brief
- **Analyze Canvas Endpoint** (`/api/agent/analyze-canvas`): Identifies 2-3 interesting regions on the canvas with suggested prompts

### 2. Frontend (React/TypeScript)
- **BriefPanel**: Left sidebar (300px, collapsible) where users enter their design brief
- **PromptBanner**: Top banner that displays AI-suggested prompts with accept/dismiss actions
- **RegionHighlights**: Subtle glowing overlays on canvas highlighting promising exploration regions
- **Analysis Indicator**: Real-time status showing when AI is analyzing the canvas

### 3. Auto-Analysis Triggers
- **Automatic**: Triggers after ANY image generation completes (text-to-image, batch, from-reference, accepted prompts)
- **Manual**: Click the "🔍 Analyze Canvas" button (appears when brief is set and 5+ images exist)
- **Smart**: Only runs when a design brief has been entered
- **2D Only**: Only available in 2D mode (3D support can be added later)

## Setup Instructions

### Step 1: Get a Gemini API Key
1. Visit https://makersuite.google.com/app/apikey
2. Create a new API key (free tier available)
3. Copy your API key

### Step 2: Configure Backend
1. Create a `.env` file in the `backend/` directory:
```bash
cd backend
cp .env.example .env
```

2. Edit `.env` and add your API key:
```
GOOGLE_API_KEY=your_actual_gemini_api_key_here
FAL_KEY=your_existing_fal_key_here
```

### Step 3: Install Dependencies
```bash
# Activate your conda environment
conda activate semantic_explorer

# Install new Python packages
pip install google-generativeai python-dotenv scikit-learn
```

### Step 4: Restart Backend
```bash
# Kill any running backend processes
# Windows:
taskkill /F /IM python.exe

# Then start fresh:
cd backend
python api.py
```

### Step 5: Start Frontend
```bash
cd frontend
npm run dev
```

## How to Use

### Basic Workflow

1. **Enter Design Brief**
   - Open the Brief Panel on the left sidebar
   - Enter your design goal (e.g., "I want to explore athletic sneakers with bold colors and modern designs")
   - Click "Generate Starter Prompts"

2. **Review AI Suggestions**
   - The Prompt Banner will appear at the top with 3 suggested prompts
   - Navigate between suggestions using the arrows
   - Click "Why?" to see the reasoning behind each suggestion
   - Click "Generate" to accept a prompt and create 8 images

3. **Explore Canvas**
   - After ~8 images, the AI will automatically analyze your canvas
   - You'll see: `🤖 Analyzing...` in the canvas stats
   - Subtle glowing circles will appear highlighting interesting regions
   - Region cards show:
     - Title (e.g., "High-top Athletic Cluster")
     - Description of what's interesting
     - Suggested prompts to explore that region further

4. **Deep Dive into Regions**
   - Click on any region card to expand it
   - Click on a suggested prompt to generate more variations in that area
   - This helps you systematically explore the design space

5. **Iterate**
   - Generate more images, load existing images, or create variations
   - The AI will automatically re-analyze after each generation completes
   - Click "🔍 Analyze Canvas" button (top-right) to manually trigger analysis anytime
   - Dismiss highlights when you want a clean view

### UI Controls

- **Brief Panel**: Collapse/expand with arrow button (left sidebar)
- **Analyze Button**: Click "🔍 Analyze Canvas" to manually trigger analysis (top-right, below stats)
- **Prompt Banner**: Dismiss with `×` button (top)
- **Region Highlights**: Dismiss all with bottom-right button (canvas overlay)
- **Analysis Status**: Watch canvas stats for `🤖 Analyzing...` indicator

## Visual Design

### Layout Adjustments
- Brief Panel: Fixed left, shifts canvas content when open
- Prompt Banner: Top banner, accounts for collapsed/expanded Brief Panel
- Region Highlights:
  - Glowing circles stay **behind** shoe images (z-index: 5)
  - Region cards appear **above** images (z-index: 60)
  - Subtle light glow with blur effect

### Color Scheme
- Agent features use blue theme (`#58a6ff`) to match existing design
- Analysis indicator uses robot emoji `🤖`
- Glow effects are very subtle (opacity 0.3-0.5)

## Troubleshooting

### Backend Issues
1. **"Gemini API not configured"**
   - Check `.env` file exists in `backend/` directory
   - Verify `GOOGLE_API_KEY` is set correctly
   - Restart backend server

2. **"No module named 'google.generativeai'"**
   - Install dependencies: `pip install google-generativeai python-dotenv scikit-learn`
   - Make sure conda environment is activated

3. **500 errors on agent endpoints**
   - Check backend console for Python errors
   - Verify Gemini API key is valid
   - Check Python version (3.8+ required)

### Frontend Issues
1. **Components not showing up**
   - Clear browser cache and refresh
   - Check browser console for errors
   - Verify frontend is running on `http://localhost:3000`

2. **"Analysis failed"**
   - Ensure backend is running on `http://localhost:8000`
   - Check if you have at least 5 images on canvas
   - Verify you've entered a design brief

## Technical Details

### Agent Prompts
The agent uses carefully crafted prompts that:
- Understand footwear design terminology
- Suggest diverse exploration strategies
- Identify clusters and gaps in the design space
- Balance creative exploration with practical constraints

### K-means Clustering
- Uses 3-5 clusters depending on image count
- Extracts representative prompts from each cluster
- Provides spatial information (center coordinates) for region highlighting

### Auto-Analysis Logic
```typescript
// Automatically triggers after ANY generation completes
// Added to finally blocks of:
// - handleGenerate (text-to-image)
// - handleBatchGenerate (batch prompts)
// - handlePromptDialogGenerate (from reference)
// - handleAcceptPrompt (AI suggested prompts)

if (currentBrief) {
  console.log("🤖 Auto-analyzing canvas after generation...");
  setTimeout(() => analyzeCanvas(), 2000); // 2s delay to let canvas settle
}

// Manual trigger: Click "🔍 Analyze Canvas" button
// Available when: currentBrief && images.length >= 5 && !is3DMode
```

## Next Steps

### Potential Enhancements
1. **3D Mode Support**: Adapt region highlights for 3D canvas
2. **History Tracking**: Save past briefs and analysis results
3. **Axis Relabeling Integration**: Re-analyze when semantic axes change
4. **Export with Agent Data**: Include agent insights in ZIP exports
5. **Analysis Caching**: Cache analysis results to avoid redundant API calls

## Demo Flow

### Example Session
1. Start with empty canvas
2. Enter brief: "Modern running shoes with sustainable materials"
3. Agent suggests:
   - "Minimalist running shoe with recycled mesh upper"
   - "Bold eco-friendly trail runner with earth tones"
   - "Sleek performance shoe highlighting recycled materials"
4. Accept first prompt → 8 images generated
5. Auto-analysis identifies:
   - "Minimalist Cluster": Clean designs with simple forms
   - "Material Focus Region": Shoes emphasizing texture
6. Click region prompt → Generate 8 more variations
7. Repeat to build comprehensive design exploration

## Files Modified

### Backend
- `backend/api.py`: Added 3 new endpoints, Gemini configuration
- `backend/.env.example`: Template for API keys

### Frontend
- `frontend/src/App.tsx`: Integrated all agent components
- `frontend/src/types/index.ts`: Added agent-related types
- `frontend/src/components/BriefPanel/`: New component
- `frontend/src/components/PromptBanner/`: New component
- `frontend/src/components/RegionHighlights/`: New component

## Support

For issues or questions:
1. Check backend console logs for detailed error messages
2. Check browser console for frontend errors
3. Verify all dependencies are installed
4. Ensure API keys are correctly configured

---

Built with ❤️ using Google Gemini 2.0 Flash Experimental
