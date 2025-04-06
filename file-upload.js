/**
 * Unified file upload interface for the cyclone viewer
 * Supports both track CSV files and A-deck files
 */

document.addEventListener('DOMContentLoaded', function() {
    // Get existing file upload elements
    const fileUpload = document.querySelector('.file-upload');
    const uploadBtn = document.getElementById('upload-btn');
    
    if (!fileUpload) {
        console.error('File upload element not found');
        return;
    }
    
    // Create a more compact file type selector
    const fileTypeSelector = document.createElement('div');
    fileTypeSelector.className = 'file-type-selector compact';
    fileTypeSelector.innerHTML = `
        <select id="file-type-dropdown" class="file-type-dropdown">
            <option value="track" selected>Track CSV</option>
            <option value="adeck">A-Deck</option>
        </select>
    `;
    
    // Insert file type selector after file label
    const fileLabel = fileUpload.querySelector('.file-label');
    if (fileLabel) {
        // Make the original label simpler
        fileLabel.textContent = 'Load File';
        fileLabel.style.marginRight = '4px';
        fileLabel.parentNode.insertBefore(fileTypeSelector, fileLabel.nextSibling);
    } else {
        fileUpload.appendChild(fileTypeSelector);
    }
    
    // Update styles for compact appearance
    const styleElement = document.createElement('style');
    styleElement.textContent = `
        .file-type-selector.compact {
            margin-left: 2px;
            margin-right: 2px;
            background: none;
            border: none;
            padding: 0;
        }
        
        .file-type-dropdown {
            font-size: 10px;
            padding: 1px 4px;
            border-radius: 3px;
            border: 1px solid var(--border);
            background-color: #2c2c2c;
            color: var(--text-primary);
            cursor: pointer;
            height: 20px;
            width: auto;
            min-width: 74px;
        }
        
        .file-upload {
            padding: 2px 4px;
            gap: 2px;
        }
        
        .upload-icon {
            font-size: 12px;
        }
        
        .file-label {
            font-size: 11px;
        }
    `;
    document.head.appendChild(styleElement);
    
    // Update the upload button if it exists
    if (uploadBtn) {
        uploadBtn.style.padding = '1px 6px';
        uploadBtn.style.fontSize = '11px';
        uploadBtn.style.marginLeft = '2px';
    }
    
    // Unified file upload handler
    const handleFileUpload = function(file) {
        if (!file) return;
        
        const fileType = document.getElementById('file-type-dropdown').value;
        
        if (fileType === 'track') {
            // Use existing CSV track loader
            if (typeof loadCSVFile === 'function') {
                loadCSVFile(file);
            } else {
                console.error('loadCSVFile function not available');
                showNotification('Error: CSV loader not available', 'error');
            }
        } else if (fileType === 'adeck') {
            // Use A-deck loader
            if (window.AdeckReader && typeof window.AdeckReader.loadAdeckFile === 'function') {
                window.AdeckReader.loadAdeckFile(file);
            } else {
                console.error('A-deck reader not available');
                showNotification('Error: A-deck loader not available', 'error');
            }
        }
    };
    
    // Handle button click
    if (uploadBtn) {
        uploadBtn.addEventListener('click', function() {
            // Create a file input element
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.csv,.txt,.dat';
            fileInput.style.display = 'none';
            document.body.appendChild(fileInput);
            
            // Handle file selection
            fileInput.addEventListener('change', function(e) {
                if (e.target.files.length > 0) {
                    handleFileUpload(e.target.files[0]);
                }
                // Remove the input after selection
                document.body.removeChild(fileInput);
            });
            
            // Trigger file dialog
            fileInput.click();
        });
    }
    
    // Handle drag and drop on the file upload area
    fileUpload.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.stopPropagation();
        fileUpload.classList.add('highlight');
    });
    
    fileUpload.addEventListener('dragleave', function(e) {
        e.preventDefault();
        e.stopPropagation();
        fileUpload.classList.remove('highlight');
    });
    
    fileUpload.addEventListener('drop', function(e) {
        e.preventDefault();
        e.stopPropagation();
        fileUpload.classList.remove('highlight');
        
        if (e.dataTransfer.files.length > 0) {
            handleFileUpload(e.dataTransfer.files[0]);
        }
    });
    
    // Update file label when file type changes
    const fileTypeDropdown = document.getElementById('file-type-dropdown');
    if (fileTypeDropdown) {
        fileTypeDropdown.addEventListener('change', function() {
            // Optional: update UI based on selected file type
            // The label now stays as "Load File" for simplicity
        });
    }
    
    console.log('Compact unified file upload interface initialized');
});
