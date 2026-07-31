import { showNotification } from './utils.js';

/**
 * Triggers the browser print dialog
 */
export function printQuote() {
    window.print();
}

/**
 * Generates and downloads a PDF of the target element.
 * Uses html2canvas and jsPDF (assumes they are loaded via CDN).
 * @param {HTMLElement} targetElement - The element to snapshot
 * @param {string} fileName - The name of the downloaded file
 */
export async function downloadPDF(targetElement, fileName = 'Premium-Quote.pdf') {
    if (!targetElement) {
        showNotification('Cannot find element to download.', 'error');
        return;
    }

    // Show loading notification
    showNotification('Generating PDF...', 'info');
    
    try {
        // Temporarily adjust styles for better PDF rendering
        const originalStyle = targetElement.style.cssText;
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        targetElement.style.padding = '24px';
        targetElement.style.backgroundColor = isDark ? '#121212' : '#f5f7fa';
        
        // Save scroll position and scroll to top to prevent html2canvas cropping content below the fold
        const scrollX = window.scrollX;
        const scrollY = window.scrollY;
        window.scrollTo(0, 0);

        // Hide elements not desired in the PDF
        const noPdfElements = targetElement.querySelectorAll('.no-pdf');
        const originalDisplays = Array.from(noPdfElements).map(el => el.style.display);
        noPdfElements.forEach(el => el.style.display = 'none');

        // Ensure html2canvas and jspdf are available
        if (typeof window.html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
            throw new Error('PDF libraries are not loaded. Please ensure internet connection.');
        }

        const { jsPDF } = window.jspdf;

        // Render to canvas
        const canvas = await html2canvas(targetElement, {
            scale: 2, // Higher quality
            useCORS: true,
            logging: false,
            backgroundColor: isDark ? '#121212' : '#f5f7fa',
            scrollX: 0,
            scrollY: 0,
            windowWidth: document.documentElement.clientWidth,
            windowHeight: document.documentElement.clientHeight
        });

        // Restore hidden elements
        noPdfElements.forEach((el, idx) => el.style.display = originalDisplays[idx]);

        // Restore styles and scroll position immediately
        targetElement.style.cssText = originalStyle;
        window.scrollTo(scrollX, scrollY);

        // Calculate dimensions (Standard PDF width 210mm, height scaled proportionally)
        const imgData = canvas.toDataURL('image/png');
        const pdfWidth = 210;
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

        // Create PDF with custom height matching content exactly
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: [pdfWidth, pdfHeight]
        });

        // Add image to PDF
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        
        // Save
        pdf.save('Premium-Quote.pdf');
        showNotification('PDF downloaded successfully!', 'success');

    } catch (error) {
        console.error('PDF Generation Error:', error);
        showNotification('Error generating PDF.', 'error');
    }
}
