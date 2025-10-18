'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Html5Qrcode } from 'html5-qrcode';
import { toast } from 'sonner';

export default function HomePage() {
  const router = useRouter();
  const [asin, setAsin] = useState('');
  const [loading, setLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
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
    // Prevent multiple scans from triggering - STRICT SINGLE ATTEMPT
    if (isProcessingRef.current || loading) {
      console.log('[SCANNER_BLOCKED]', 'Already processing, ignoring scan');
      return;
    }
    
    isProcessingRef.current = true;
    console.log('[SCANNER_RESULT]', 'Single attempt only', { result });
    
    // Stop scanner immediately to prevent re-scanning
    await stopScanner();
    
    const identified = identifyProductCode(result);
    
    if (identified) {
      toast.dismiss();
      toast.info(`🔍 ${identified.type} detected: ${identified.code}`);
      
      setLoading(true);
      toast.loading('Searching Amazon for product...');
      
      try {
        // Single API call - NO RETRIES
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s max
        
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

        const scrapeResult = await response.json();
        toast.dismiss();

        if (scrapeResult.success) {
          toast.success('✅ Product added successfully!');
          setAsin('');
          setTimeout(() => {
            router.push('/products');
          }, 1500);
        } else if (response.status === 409) {
          toast.error('⚠️ Product already in database');
          setAsin(identified.code);
        } else if (response.status === 429) {
          toast.error('⏳ Rate limit\n\nPlease wait a few seconds before trying again.', {
            duration: 5000,
          });
          setAsin(identified.code);
        } else if (response.status === 404) {
          toast.error(`❌ Product not found\n\n${identified.type}: ${identified.code}\n\nCouldn't find this product on Amazon.`, {
            duration: 6000,
          });
          setAsin(identified.code);
        } else {
          toast.error(`❌ Failed to add product\n\n${scrapeResult.error || 'Unknown error'}`, {
            duration: 5000,
          });
          setAsin(identified.code);
        }
      } catch (error: any) {
        console.error('[PRODUCT_ADD_ERROR]', error);
        toast.dismiss();
        
        if (error.name === 'AbortError') {
          toast.error('❌ Request timeout\n\nAmazon took too long to respond. Try again.', {
            duration: 5000,
          });
        } else {
          toast.error('❌ Network error\n\nPlease check your connection.', {
            duration: 5000,
          });
        }
        setAsin(identified.code);
      } finally {
        setLoading(false);
        isProcessingRef.current = false;
      }
    } else {
      toast.error(`❌ Unrecognized code format\n\nScanned: "${result}"\n\nSupported: ASIN, FNSKU, UPC, EAN, SKU`, {
        duration: 5000,
      });
      await stopScanner();
      isProcessingRef.current = false;
    }
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!asin) {
      toast.error('⚠️ Please enter a product identifier');
      return;
    }

    const identified = identifyProductCode(asin);
    
    if (!identified) {
      toast.error('❌ Invalid product code\n\nSupported formats:\n• ASIN (B09XYZ1234)\n• FNSKU (X004RPNHQT)\n• UPC (12-13 digits)\n• SKU (alphanumeric)\n• Amazon URL');
      return;
    }

    toast.dismiss();
    const toastId = toast.loading(`Searching Amazon for ${identified.type}...`);
    setLoading(true);

    try {
      // Single API call - NO RETRIES
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s max
      
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
        toast.success('✅ Product added successfully!', { id: toastId });
        setAsin('');
        setTimeout(() => {
          router.push('/products');
        }, 1500);
      } else if (response.status === 409) {
        toast.error('⚠️ Product already in database', { id: toastId });
      } else if (response.status === 429) {
        toast.error('⏳ Rate limit\n\nPlease wait a few seconds before trying again.', { 
          id: toastId,
          duration: 5000,
        });
      } else if (response.status === 404) {
        toast.error(`❌ Product not found\n\n${identified.type}: ${identified.code}\n\nCouldn't find this product on Amazon.`, { 
          id: toastId,
          duration: 6000,
        });
      } else {
        toast.error(`❌ Failed to add product\n\n${result.error || 'Unknown error'}`, { 
          id: toastId,
          duration: 5000,
        });
      }
    } catch (error: any) {
      console.error('[PRODUCT_ADD_ERROR]', error);
      
      if (error.name === 'AbortError') {
        toast.error('❌ Request timeout\n\nAmazon took too long to respond.', { 
          id: toastId,
          duration: 5000,
        });
      } else {
        toast.error('❌ Network error\n\nPlease check your connection.', { 
          id: toastId,
          duration: 5000,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen p-4">
      <div className="max-w-2xl mx-auto pt-20">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold gradient-text mb-2">
            eBay Bulk Lister
          </h1>
          <p className="text-gray-600">
            Scan or enter any product code (ASIN, UPC, FNSKU, SKU)
          </p>
        </div>

        {/* Main Card */}
        <div className="card p-8 mb-6">
          {showScanner ? (
            <div className="space-y-4">
              <div className="text-center mb-4">
                <p className="text-gray-700 font-medium">
                  Position barcode or QR code within the frame
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Supports QR codes and standard barcodes
                </p>
              </div>
              <div 
                id="qr-reader" 
                className="mx-auto rounded-lg overflow-hidden shadow-lg"
                style={{ width: '100%', maxWidth: '500px' }}
              ></div>
              <button
                onClick={stopScanner}
                className="w-full btn-secondary"
              >
                Cancel Scanning
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* ASIN Input */}
              <div>
                <label
                  htmlFor="asin"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Amazon ASIN
                </label>
                <input
                  type="text"
                  id="asin"
                  value={asin}
                  onChange={(e) => setAsin(e.target.value)}
                  placeholder="ASIN, UPC, FNSKU, SKU, or Amazon URL"
                  className="w-full px-4 py-3 text-lg border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 font-mono"
                  disabled={loading}
                />
                <p className="mt-2 text-sm text-gray-500">
                  Accepts ASIN, UPC, EAN, FNSKU, SKU, or Amazon URL
                </p>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3">
                <button
                  type="submit"
                  disabled={loading || !asin}
                  className="w-full btn-primary py-4 text-lg"
                >
                  {loading ? (
                    <span className="flex items-center justify-center">
                      <svg
                        className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
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
                    'Add Product'
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setShowScanner(true)}
                  className="w-full btn-secondary py-4 text-lg"
                  disabled={loading}
                >
                  Scan Barcode/QR Code
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Navigation */}
        <div className="text-center">
          <button
            onClick={() => router.push('/products')}
            className="gradient-text font-medium text-lg hover:underline transition-all duration-200"
          >
            View All Products →
          </button>
        </div>

        {/* Info Section */}
        <div className="mt-12 card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            How it works
          </h2>
          <ol className="space-y-2 text-gray-600">
            <li className="flex items-start">
              <span className="font-bold gradient-text mr-2">1.</span>
              <span>Scan or enter an Amazon ASIN</span>
            </li>
            <li className="flex items-start">
              <span className="font-bold gradient-text mr-2">2.</span>
              <span>Product data is automatically scraped and images are saved</span>
            </li>
            <li className="flex items-start">
              <span className="font-bold gradient-text mr-2">3.</span>
              <span>Manage products and export CSV for eBay bulk upload</span>
            </li>
            <li className="flex items-start">
              <span className="font-bold gradient-text mr-2">4.</span>
              <span>Track listing status (Inactive → Posted → Sold)</span>
            </li>
          </ol>
        </div>
      </div>
    </main>
  );
}

