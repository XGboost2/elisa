# ELISA Plate Analysis Backend

FastAPI backend for mobile ELISA plate analysis app.

## Features

- 📸 Image-based ELISA plate analysis
- 🎯 Automatic 96-well grid detection
- 🔬 Optical density calculation
- 📊 Multiple calibration curve types (linear, polynomial, logarithmic, 4PL)
- 🧮 Concentration quantification
- ✨ Advanced image preprocessing

## Setup

### 1. Create Virtual Environment

```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env if needed
```

### 4. Run Server

```bash
python app.py
```

The API will be available at `http://localhost:8000`

## API Documentation

Once running, visit:
- Interactive docs: `http://localhost:8000/docs`
- Alternative docs: `http://localhost:8000/redoc`

## API Endpoints

### POST /api/analyze
Upload and analyze ELISA plate image

### POST /api/calibrate
Create calibration curve from standards

### POST /api/quantify
Calculate concentrations from OD values

### GET /api/results/{analysis_id}
Retrieve analysis results

### GET /api/calibrations
List all saved calibrations

## Project Structure

```
backend/
├── app.py                          # Main FastAPI application
├── requirements.txt                # Python dependencies
├── api/
│   └── routes.py                   # API endpoints
├── services/
│   ├── plate_analyzer.py           # Plate detection & analysis
│   └── calibration_service.py      # Calibration & quantification
└── utils/
    ├── config.py                   # Configuration
    └── image_preprocessing.py      # Image processing utilities
```

## Tech Stack

- **FastAPI**: Modern async web framework
- **OpenCV**: Computer vision
- **NumPy/SciPy**: Scientific computing
- **scikit-learn**: Machine learning (K-means clustering)
- **scikit-image**: Image processing
- **Pydantic**: Data validation
