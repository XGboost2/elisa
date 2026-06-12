# ELISA Plate Analyzer

📱 Mobile app for camera-based ELISA plate analysis using AI

## Features

- 📸 **Camera Capture**: Take photos with guided overlay for proper plate alignment
- 🔬 **Automated Analysis**: AI-powered 96-well grid detection
- 📊 **Optical Density**: Calculate OD values for each well
- 🎨 **Heatmap Visualization**: Color-coded results display
- 📈 **Calibration Curves**: Support for multiple curve types (linear, polynomial, logarithmic, 4PL)
- 💾 **Data Export**: Export results in CSV/PDF format

## Tech Stack

### Mobile App (Frontend)
- **Expo / React Native**: Cross-platform mobile development
- **React Navigation**: Screen navigation
- **Expo Camera**: Camera access
- **Axios**: API communication

### Backend
- **Python FastAPI**: High-performance async API
- **OpenCV**: Computer vision and image processing
- **scikit-learn**: Machine learning (K-means clustering)
- **NumPy/SciPy**: Scientific computing
- **scikit-image**: Advanced image processing

## Setup

### 1. Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Backend will run on `http://localhost:8000`

### 2. Mobile App Setup

```bash
npm install
```

**Configure API URL**:
- Edit `src/config/api.js`
- For physical devices, use your computer's IP address instead of `localhost`

### 3. Run the App

```bash
# Start Expo
npx expo start

# Run on iOS
npx expo run:ios

# Run on Android  
npx expo run:android

# Run on web (limited camera support)
npx expo start --web
```

## Usage

1. **Launch the App**: Open on your mobile device
2. **Start Backend**: Ensure Python backend is running
3. **Capture Plate**: 
   - Tap "Capture Plate" button
   - Align ELISA plate within guide overlay
   - Ensure good lighting
   - Capture photo
4. **View Results**: 
   - See well detection status
   - View optical density heatmap
   - Check quality metrics
5. **Optional**: Create calibration curves for concentration quantification

## ML Dataset Collection Workflow

Use **Collect ML Dataset** on the home screen when lab mates need to collect raw images for later validation or deep-learning experiments.

Recommended workflow:

1. Start the backend.
2. Open **Collect ML Dataset**.
3. Take or choose a raw ELISA plate photo.
4. Enter metadata:
   - Study / batch name
   - Assay name
   - Operator or lab mate ID
   - Phone / camera model
   - Lighting or fixture condition
   - Chromogen and assay type
   - Notes
5. Tap **Save Dataset Plate**.
6. Later, paste the spectrophotometer / plate-reader CSV into **Attach Reader CSV** for that same plate.
7. Export **Dataset Manifest CSV** when preparing data for analysis or machine learning.

The backend stores each collected plate under `backend/dataset/{plate_id}/` with:

- the raw image
- `metadata.json`
- optional raw reader CSV
- parsed reader OD labels by well

The manifest endpoint is:

```text
GET /api/dataset/manifest.csv
```

It exports one row per labeled well:

```csv
plate_id,well,reader_od,image_path,study_name,assay_name,operator,device_model,lighting_condition,chromogen,assay_type,created_at,notes
```

Supported reader CSV formats:

- Long format: `well,od`
- 8x12 matrix format with rows `A-H` and columns `1-12`
- Vendor-style adjacent well/value pairs such as `A1,0.052,A2,0.061`

## API Configuration

Edit `src/config/api.js`:

```javascript
export const API_BASE_URL = 'http://YOUR_COMPUTER_IP:8000/api';
```

**Find your IP**:
- macOS/Linux: `ifconfig | grep "inet "`
- Windows: `ipconfig`

## Project Structure

```
elisa/
├── backend/                 # Python FastAPI backend
│   ├── app.py              # Main server
│   ├── api/                # API endpoints
│   ├── services/           # Analysis & calibration
│   └── utils/              # Image preprocessing
├── src/
│   ├── screens/            # App screens
│   ├── components/         # Reusable components
│   ├── services/           # API client
│   ├── config/             # Configuration
│   └── styles/             # Design system
├── App.js                  # Main app component
└── package.json
```

## Troubleshooting

**Backend not connecting**:
- Check backend is running on port 8000
- Verify API_BASE_URL in `src/config/api.js`
- On physical device, use computer's IP instead of localhost
- Ensure devices are on same WiFi network

**Camera not working**:
- Grant camera permissions when prompted
- Check iOS Info.plist / Android permissions in `app.json`

**Poor detection results**:
- Ensure good lighting
- Avoid shadows on plate
- Keep camera steady
- Position camera directly above plate

## License

MIT

## Support

For issues or questions, please check the documentation or create an issue.
