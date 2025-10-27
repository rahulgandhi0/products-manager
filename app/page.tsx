'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Html5Qrcode } from 'html5-qrcode';
import { toast } from 'sonner';

export default function HomePage() {
  const router = useRouter();
  const [inputs, setInputs] = useState<string[]>(['']);
  const [loading, setLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string[]>([]);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [isScannerReady, setIsScannerReady] = useState(false);
  const isProcessingRef = useRef(false);

  const identifyProductCode = (input: string): { type: string; code: string } | null => {
    const trimmed = input.trim();
    
    // ASIN: 10 alphanumeric, starts with B
    if (/^B[A-Z0-9]{9}$/i.test(trimmed)) {
      return { type: 'ASIN', code: trimmed.toUpperCase() };
    }
    
    // FNSKU: 10 alphanumeric, starts with X
    if (/^X[A-Z0-9]{9}$/i.test(trimmed)) {
      return { type: 'FNSKU', code: trimmed.toUpperCase() };
    }
    
    // Other 10-char codes (might be ASIN variants)
    if (/^[A-Z0-9]{10}$/i.test(trimmed)) {
      return { type: 'ASIN', code: trimmed.toUpperCase() };
    }
    
    // UPC-A: 12 digits
    if (/^\d{12}$/.test(trimmed)) {
      return { type: 'UPC', code: trimmed };
    }
    
    // EAN-13: 13 digits
    if (/^\d{13}$/.test(trimmed)) {
      return { type: 'EAN', code: trimmed };
    }
    
    // UPC-E: 8 digits (sometimes 6)
    if (/^\d{6,8}$/.test(trimmed)) {
      return { type: 'UPC', code: trimmed };
    }
    
    // Generic SKU: any alphanumeric string
    if (/^[A-Z0-9-_]{3,}$/i.test(trimmed)) {
      return { type: 'SKU', code: trimmed.toUpperCase() };
    }
    
    // Try to extract ASIN from Amazon URL
    const asinPatterns = [
      /\/dp\/([A-Z0-9]{10})/i,
      /\/gp\/product\/([A-Z0-9]{10})/i,
      /\/ASIN\/([A-Z0-9]{10})/i,
      /[?&]ASIN=([A-Z0-9]{10})/i,
      /amazon\.com\/.*\/([A-Z0-9]{10})/i,
    ];
    
    for (const pattern of asinPatterns) {
      const match = trimmed.match(pattern);
      if (match) {
        return { type: 'ASIN', code: match[1].toUpperCase() };
      }
    }
    
    return null;
  };

  const handleScan = async (result: string) => {
    // Prevent multiple scans from triggering
    if (isProcessingRef.current || loading) {
      return;
    }
    
    isProcessingRef.current = true;
    await stopScanner();
    
    const identified = identifyProductCode(result);
    
    if (identified) {
      // Add to the first empty input or create a new one
      const emptyIndex = inputs.findIndex(input => !input.trim());
      if (emptyIndex !== -1) {
        const newInputs = [...inputs];
        newInputs[emptyIndex] = identified.code;
        setInputs(newInputs);
      } else if (inputs.length < 10) {
        setInputs([...inputs, identified.code]);
      }
      toast.info(`${identified.type} detected: ${identified.code}`);
    } else {
      toast.error(`Unrecognized code format: "${result}"`);
    }
    
    isProcessingRef.current = false;
  };

  const startScanner = async () => {
    try {
      // Reset processing flag when starting scanner
      isProcessingRef.current = false;
      
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode('qr-reader');
      }

      const config = {
        fps: 5, // Reduced from 10 to prevent rapid scanning
        qrbox: { width: 250, height: 250 },
        formatsToSupport: [
          // QR Code
          0, // QR_CODE
          // Linear Barcodes
          8, // CODE_128
          9, // CODE_39
          10, // EAN_13
          11, // EAN_8
          12, // UPC_A
          13, // UPC_E
        ],
      };

      await scannerRef.current.start(
        { facingMode: 'environment' },
        config,
        (decodedText) => {
          handleScan(decodedText);
        },
        (error) => {
          // Suppress continuous scanning errors
        }
      );
      
      setIsScannerReady(true);
      console.log('[SCANNER_STARTED]', 'Ready to scan QR codes and barcodes');
      toast.info('📷 Scanner ready - point at barcode or QR code');
    } catch (error) {
      console.error('[SCANNER_START_ERROR]', error);
      toast.error('❌ Failed to start camera\n\nPlease check camera permissions in your browser settings.');
      setShowScanner(false);
    }
  };

  const stopScanner = async () => {
    try {
      if (scannerRef.current && isScannerReady) {
        await scannerRef.current.stop();
        scannerRef.current.clear();
        setIsScannerReady(false);
        console.log('[SCANNER_STOPPED]');
      }
    } catch (error) {
      console.error('[SCANNER_STOP_ERROR]', error);
    }
    setShowScanner(false);
    isProcessingRef.current = false; // Reset processing flag
  };

  useEffect(() => {
    if (showScanner) {
      startScanner();
    }
    
    return () => {
      if (scannerRef.current && isScannerReady) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, [showScanner]);

  const handleInputChange = (index: number, value: string) => {
    const newInputs = [...inputs];
    newInputs[index] = value;
    setInputs(newInputs);
    
    // Add new input if this is the last one and not at max capacity
    if (index === inputs.length - 1 && value.trim() && inputs.length < 10) {
      setInputs([...newInputs, '']);
    }
  };

  const handleRemoveInput = (index: number) => {
    if (inputs.length > 1) {
      const newInputs = inputs.filter((_, i) => i !== index);
      setInputs(newInputs.length === 0 ? [''] : newInputs);
    } else {
      setInputs(['']);
    }
  };

  const handleBulkImport = async () => {
    const validInputs = inputs.filter(input => input.trim());
    
    if (validInputs.length === 0) {
      toast.error('Please enter at least one product code');
      return;
    }

    setLoading(true);
    setProcessingStatus([]);
    
    const results = {
      successful: 0,
      failed: 0,
      skipped: 0,
    };

    for (let i = 0; i < validInputs.length; i++) {
      const input = validInputs[i];
      const identified = identifyProductCode(input);
      
      if (!identified) {
        setProcessingStatus(prev => [...prev, `Invalid format: ${input}`]);
        results.failed++;
        continue;
      }

      setProcessingStatus(prev => [...prev, `Processing ${i + 1}/${validInputs.length}: ${identified.code}`]);

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        
        const response = await fetch('/api/scrape-amazon', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            identifier: identified.code,
            identifierType: identified.type,
          }),
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        const result = await response.json();

        if (result.success) {
          setProcessingStatus(prev => [...prev, `Success: ${identified.code}`]);
          results.successful++;
        } else if (response.status === 409) {
          setProcessingStatus(prev => [...prev, `Already exists: ${identified.code}`]);
          results.skipped++;
        } else if (response.status === 404) {
          setProcessingStatus(prev => [...prev, `Not found: ${identified.code}`]);
          results.failed++;
        } else {
          setProcessingStatus(prev => [...prev, `Failed: ${identified.code}`]);
          results.failed++;
        }
      } catch (error: any) {
        setProcessingStatus(prev => [...prev, `Error: ${identified.code}`]);
        results.failed++;
      }

      // Wait 2 seconds between requests to avoid rate limiting
      if (i < validInputs.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    setLoading(false);
    
    // Show final summary
    const summary = `Completed: ${results.successful} added, ${results.skipped} skipped, ${results.failed} failed`;
    toast.success(summary);
    
    // Reset inputs if all successful
    if (results.failed === 0) {
      setInputs(['']);
      setTimeout(() => {
        router.push('/products');
      }, 2000);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Modern Header */}
      <header className="sticky top-0 z-50 glass border-b border-gray-200/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <h1 className="text-xl font-bold gradient-text">eBay Bulk Lister</h1>
            </div>
            <button
              onClick={() => router.push('/products')}
              className="flex items-center space-x-2 btn-secondary text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              <span>View Products</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
              Bulk Import
            </h2>
            <p className="text-lg text-gray-600">
              Add up to 10 products at once
            </p>
          </div>

          <div className="card p-6 sm:p-8">
            {showScanner ? (
              <div className="space-y-4">
                <div 
                  id="qr-reader" 
                  className="mx-auto rounded-lg overflow-hidden shadow-lg"
                  style={{ width: '100%', maxWidth: '500px' }}
                ></div>
                <button
                  onClick={stopScanner}
                  className="w-full btn-secondary py-3"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Input Fields */}
                <div className="space-y-3">
                  {inputs.map((input, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="text"
                        value={input}
                        onChange={(e) => handleInputChange(index, e.target.value)}
                        placeholder={`Product ${index + 1}: ASIN, UPC, FNSKU, SKU or URL`}
                        className="flex-1 px-4 py-3 text-base border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 font-mono placeholder:text-gray-400"
                        disabled={loading}
                        autoFocus={index === 0}
                      />
                      {inputs.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveInput(index)}
                          className="p-3 text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                          disabled={loading}
                          title="Remove"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                  {inputs.length < 10 && !loading && (
                    <p className="text-sm text-gray-500 text-center">
                      {inputs.length}/10 products • Enter a value to add more
                    </p>
                  )}
                </div>

                {/* Processing Status */}
                {processingStatus.length > 0 && (
                  <div className="bg-gray-50 rounded-xl p-4 max-h-60 overflow-y-auto">
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Processing Log</h3>
                    <div className="space-y-1 font-mono text-xs text-gray-600">
                      {processingStatus.map((status, index) => (
                        <div key={index} className="py-1 border-b border-gray-200 last:border-0">
                          {status}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={handleBulkImport}
                    disabled={loading || inputs.every(input => !input.trim())}
                    className="btn-primary py-3.5 text-base font-semibold"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center">
                        <svg
                          className="animate-spin -ml-1 mr-2 h-5 w-5 text-white"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                        Processing...
                      </span>
                    ) : (
                      <span className="flex items-center justify-center">
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        Bulk Import
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowScanner(true)}
                    className="btn-secondary py-3.5 text-base font-semibold"
                    disabled={loading}
                  >
                    <span className="flex items-center justify-center">
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                      </svg>
                      Scan Code
                    </span>
                  </button>
                </div>

                <p className="text-xs text-gray-500 text-center">
                  Supports ASIN, UPC, EAN, FNSKU, SKU & Amazon URLs
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

