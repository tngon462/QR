T-NGON Weight Label System

Complete documentation for the Label Printing System (IN).

## Project Structure

### Web App (GitHub Pages)
- `web/index.html` - Main print interface
- `web/designer.html` - Label template designer
- `web/settings.html` - Configuration page
- `web/print.html` - Print history
- `web/js/` - JavaScript modules
- `web/css/` - Stylesheets
- `web/assets/` - Images and resources

### Print Hub (Node.js - LAN)
- `hub/hub.js` - Main server
- `hub/print_engine.js` - Print processing
- `hub/queue.js` - Job queue management
- `hub/package.json` - Dependencies
- `hub/hub.config.json.example` - Configuration template

## Quick Start

### Web App Deployment (GitHub Pages)
1. Copy `web/` contents to your GitHub Pages root
2. Access via `https://yourusername.github.io/QR/web/`
3. Configure Hub URL in Settings page

### Print Hub Setup (Windows 11)
```bash
cd hub
npm install
cp hub.config.json.example hub.config.json
node hub.js
```

Server runs on: `http://192.168.x.x:8787`

## Business Rules

### Barcode Naming Convention
- Base Code: 123456
- Weight-based suffix: T + pad3(grams/10)
- Example: 560g → T056 → Full: 123456T056

### Price Calculation
- Input: Price per 1kg
- Formula: amount = round(pricePerKg × grams / 1000)
- Rounding: To nearest 10 units

### Button Generation
- Min: 500g, Max: 2000g, Step: 50g
- Generates: T050, T055, T060, ..., T200

## API Endpoints

### Print Hub
- `GET /health` - Server status
- `GET /printers` - List available printers
- `POST /print` - Send print job

### Request Format
```json
{
  "token": "YOUR_TOKEN",
  "printer": "Optional",
  "copies": 1,
  "label": {
    "width_mm": 50,
    "height_mm": 30,
    "dpi": 203
  },
  "job": {
    "barcode": "123456T056",
    "name": "Thịt bò",
    "weight_g": 560,
    "weight_kg": 0.56,
    "amount": 580
  },
  "image_png_base64": "data:image/png;base64,..."
}
```

## Features

✓ Web-based label designer (drag & drop)
✓ Real-time price calculation
✓ Multi-weight button generation
✓ PNG to PDF conversion
✓ Print queue management
✓ LocalStorage configuration
✓ Responsive mobile UI
✓ Offline-capable design

## Phase 1 Implementation
- PNG rendering → PDF conversion → OS printer driver
- Next phase: TSPL/ZPL raw commands for thermal printers

## Support
For issues, check console logs and ensure Hub is running on LAN with correct token.
