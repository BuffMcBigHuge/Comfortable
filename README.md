# COMFORTABLE
> ComfyUI Video Workflow Analyzer & Export

This is a powerful, locally-run web application designed for artists and developers working with AI-generated video, particularly those using ComfyUI. It allows you to load a collection of videos, deeply analyze the embedded ComfyUI workflow metadata, and create customized video exports for review and comparison.

The application consists of a Node.js/Express backend for all the heavy lifting (video processing and analysis) and a modern React/Vite frontend for a smooth, interactive user experience.

## Core Features

### 1. Video Library & Metadata Analysis
- **Load Videos Easily:** Add videos to your library by dragging and dropping files, selecting a folder, or picking individual files.
- **Automatic Metadata Extraction:** The backend uses `ffprobe` to read standard video properties (resolution, duration, FPS).
- **Deep ComfyUI Workflow Parsing:** The application automatically finds and parses ComfyUI workflow data embedded in the video's metadata tags. It intelligently extracts widget values and input parameters from the workflow nodes, making them available for review.

### 2. Workflow Parameter Comparison
This is the core feature for analysis and iteration. The UI provides two powerful views for your video library:
- **Table View:** A straightforward table of all loaded videos with their extracted metadata and workflow parameters.
- **Diff View:** An advanced view that shows a side-by-side comparison of the workflow parameters between a video and the one preceding it in the list. It highlights only the values that have changed, making it incredibly easy to track how modifications to prompts, seeds, LoRA weights, or any other setting affected the output.
- **Advanced Filtering:**
    - **Key Hiding:** Use substrings or regex to hide common or uninteresting parameters (e.g., `seed`, `widgets_values[0]`) to reduce noise.
    - **Node Whitelist:** Filter the view to show parameters from only the ComfyUI node types you care about, giving you a focused view of the most important changes.

### 3. Visual Timeline & Export Builder
- **Build a Timeline:** Add videos from your library to an export timeline using "Add" buttons.
- **Custom Video Exports:** Create new videos based on your timeline with a rich set of options:
    - **Sequential Mode:** Concatenates all videos on the timeline into a single, continuous video.
    - **Grid Mode:** Creates a grid layout of all videos playing simultaneously in one frame. You can specify the number of columns.
    - **On-Video Labels:** Overlay crucial information directly onto the exported video. You can choose to display the original filename or select from any of the extracted ComfyUI workflow parameters to be rendered on each clip, perfect for reviews and sharing.
    - **Custom Output:** Control the final resolution and FPS of the exported video.

## Technology Stack

- **Backend:**
    - **Runtime:** Node.js
    - **Framework:** Express
    - **Video Processing:** `ffmpeg` (via `fluent-ffmpeg`) for all transcoding, concatenation, and grid stacking.
    - **Image Manipulation:** `sharp` for dynamically generating text overlay images.
    - **File Handling:** `multer` for handling video uploads.

- **Frontend:**
    - **Framework:** React
    - **Build Tool:** Vite
    - **UI Components:** Shadcn UI, Radix UI, Vaul (for drawers).
    - **Styling:** Tailwind CSS
    - **Routing:** React Router
    - **State Management:** React Hooks & Context

## Getting Started

The project is structured as a monorepo with a `client` and a `server` directory. You will need to run both simultaneously.

### Prerequisites
- Node.js (v18 or later recommended)
- npm

### 1. Run the Backend Server

The server handles all file processing and API requests.

```bash
# Navigate to the server directory
cd server

# Install dependencies
npm install

# Start the development server (with hot-reloading)
npm run dev
```
The server will start on `http://127.0.0.1:5180`.

### 2. Run the Frontend Client

The client provides the web interface.

```bash
# Navigate to the client directory from the project root
cd client

# Install dependencies
npm install

# Start the development server
npm run dev
```
The React application will be available at `http://localhost:5173`. Open this URL in your browser to use the application.
