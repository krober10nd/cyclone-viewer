# Debug Panel Walkthrough

I have added a new **Debug Panel** to the application to make it easier to debug UI issues and verify application state.

## Features

1.  **Toggleable Interface**: Press `Ctrl + Shift + D` to toggle the panel visibility.
2.  **State Inspector**: View real-time information about:
    - Map Center & Zoom
    - Track Point Count
    - Selected Storm ID
    - Current Unit System
    - View Mode
3.  **Action Buttons**:
    - **Reset Map**: Clears all layers and resets the view.
    - **Fix A-Deck Vis**: Forces A-Deck tracks to be visible if they get stuck hidden.
    - **Run Self-Test**: Runs a suite of automated checks to verify critical UI elements and state.
4.  **Live Logs**: Captures console logs, warnings, and errors and displays them in the panel.

## How to Use

1.  **Open the App**: Start the application as usual.
2.  **Open Debug Panel**: Press `Ctrl + Shift + D`.
3.  **Check State**: Observe the "State Inspector" section to see current values.
4.  **Run Tests**: Click "Run Self-Test" to verify that the map and core components are loaded correctly.
5.  **View Logs**: Check the "Logs" section for any errors or warnings.

## Files Modified

- `src/ui/debug-panel.js`: New component containing the debug panel logic.
- `src/main.js`: Updated to initialize the debug panel on app start.
- `styles.css`: Added styles for the debug panel.

## Verification

To verify the changes:

1.  Reload the application.
2.  Press `Ctrl + Shift + D`.
3.  Ensure the panel appears.
4.  Click "Run Self-Test" and ensure all checks pass (Green "PASS" logs).
