"""
ELISA Plate Analysis Backend
FastAPI server for mobile app image processing and analysis
"""
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from datetime import datetime

from api.routes import router as api_router
from utils.config import settings

# Create upload and results directories
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.RESULTS_DIR, exist_ok=True)
os.makedirs(settings.DATASET_DIR, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager for startup and shutdown events"""
    print("🚀 Starting ELISA Analysis Backend...")
    print(f"📁 Upload directory: {settings.UPLOAD_DIR}")
    print(f"📊 Results directory: {settings.RESULTS_DIR}")
    print(f"🧬 Dataset directory: {settings.DATASET_DIR}")
    yield
    print("👋 Shutting down ELISA Analysis Backend...")


# Initialize FastAPI app
app = FastAPI(
    title="ELISA Plate Analysis API",
    description="Camera-based ELISA plate analysis using computer vision and AI",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS for mobile app
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(api_router, prefix="/api")


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "running",
        "service": "ELISA Plate Analysis API",
        "version": "1.0.0",
        "timestamp": datetime.utcnow().isoformat()
    }


@app.get("/health")
async def health_check():
    """Detailed health check"""
    return {
        "status": "healthy",
        "upload_dir_exists": os.path.exists(settings.UPLOAD_DIR),
        "results_dir_exists": os.path.exists(settings.RESULTS_DIR),
        "dataset_dir_exists": os.path.exists(settings.DATASET_DIR),
    }


if __name__ == "__main__":
    uvicorn.run(
        "app:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=settings.DEBUG
    )
