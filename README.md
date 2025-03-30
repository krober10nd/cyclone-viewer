# <p align="center">
  <img src="docs/logo.png" alt="Cyclone Vortex" width="100"/>
  </p>
# Cyclone Track Editor/Visualizer

A simple application for visualizing and editing tropical cyclone tracks with meteorological parameters.

## Installation

### Prerequisites
- Node.js (v14 or newer)
- npm (v6 or newer)

### Setup
1. Clone this repository:
   ```
   git clone https://github.com/your-username/cyclone_viewer.git
   cd cyclone_viewer
   ```

2. Install dependencies:
   ```
   npm install
   ```
   This only installs the dependencies, it does not build the application.

## Usage

### Running the application

#### Using Electron (recommended)
Run the application using Electron:

```
npm start
```

This launches the application in its own window with full functionality.

#### Using a web browser
You can also open the application directly in a web browser:

1. Navigate to the project directory
2. Open the `index.html` file in Chrome or another modern browser:
3. Alternatively, you can simply drag the `index.html` file into an open Chrome window.

**Note:** When running in a browser, some features like file system access might have limitations due to browser security restrictions.

### Loading cyclone tracks
1. Click the "CSV" button to load cyclone track data
2. Upload a CSV file with the following columns:
- latitude, longitude (required)
- wind_speed (m/s)
- mslp (hPa, minimum central pressure)
- rmw (m, radius of maximum winds)
- r34_ne, r34_se, r34_sw, r34_nw (m, 34-knot wind radii in four quadrants)
 - roci (m, radius of outermost closed isobar)

#### Example Track Visualization

![Example Track](docs/sample_track.png)

### Editing cyclone parameters
1. Click on a storm position to view its details
2. Toggle "Edit Mode" to modify cyclone parameters
3. Drag markers to adjust cyclone position
4. Use the floating dialog to adjust wind speed, pressure, and radii

### Controls
- **Toggle Units**: Switch between metric and imperial units
- **Scale**: Choose between Saffir-Simpson and Australian BoM scales
- **Export**: Export edited track data to CSV

## Building for Distribution

To package the application for distribution:

```
npm run package
```

This will create executables for macOS and Linux in the `release-builds` directory.

### Custom Build Options

You can modify the packaging options in `package.json` to build for additional platforms or customize the output:

```json
"package": "electron-packager . CycloneTracker --platform=darwin,linux,win32 --arch=x64 --out=release-builds --overwrite"