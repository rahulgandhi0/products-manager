'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Html5Qrcode } from 'html5-qrcode';
import { toast } from 'sonner';

type CsvLogEntry = { text: string; type: 'success' | 'error' | 'skip' | 'info' };

export default function HomePage() {
  const router = useRouter();
  const [inputs, setInputs] = useState<string[]>(['']);
  const [loading, setLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string[]>([]);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [isScannerReady, setIsScannerReady] = useState(false);
  const isProcessingRef = useRef(false);

  // CSV import state
  const [csvItems, setCsvItems] = useState<string[]>([]);
  const [csvFileName, setCsvFileName] = useState('');
  const [csvProcessing, setCsvProcessing] = useState(false);
  const [csvProgress, setCsvProgress] = useState({ current: 0, total: 0, successful: 0, failed: 0, skipped: 0 });
  const [csvLog, setCsvLog] = useState<CsvLogEntry[]>([]);
  const [csvDragOver, setCsvDragOver] = useState(false);
  const [csvCurrentItem, setCsvCurrentItem] = useState<{ code: string; type: string; startedAt: number } | null>(null);
  const [csvElapsed, setCsvElapsed] = useState(0);
  const [csvWaiting, setCsvWaiting] = useState(false);
  const csvCancelRef = useRef(false);
  const csvFileInputRef = useRef<HTMLInputElement>(null);
  const csvLogEndRef = useRef<HTMLDivElement>(null);

  const identifyProductCode = (input: string): { type: string; code: string } | null => {
    const trimmed = input.trim();
    
    // EAN-13: 13 digits (check first to avoid confusion with UPC)
    if (/^\d{13}$/.test(trimmed)) {
      return { type: 'EAN', code: trimmed };
    }
    
    // UPC-A: 12 digits
    if (/^\d{12}$/.test(trimmed)) {
      return { type: 'UPC', code: trimmed };
    }
    
    // UPC-A with missing leading zero: 11 digits (add the zero back)
    if (/^\d{11}$/.test(trimmed)) {
      return { type: 'UPC', code: '0' + trimmed };
    }
    
    // ASIN: 10 alphanumeric, starts with B (most common)
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

  // Auto-scroll CSV log to bottom
  useEffect(() => {
    csvLogEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [csvLog]);

  // Live elapsed timer for current scrape
  useEffect(() => {
    if (!csvCurrentItem) { setCsvElapsed(0); return; }
    const id = setInterval(() => setCsvElapsed(Math.floor((Date.now() - csvCurrentItem.startedAt) / 1000)), 500);
    return () => clearInterval(id);
  }, [csvCurrentItem]);

  const parseCsvFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) {
        toast.error('CSV file is empty');
        return;
      }

      // Find the column index that holds links/URLs/ASINs
      const headerCols = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''));
      const linkIdx = headerCols.findIndex(h =>
        h === 'link' || h === 'url' || h === 'asin' || h.includes('url') || h.includes('link')
      );

      let items: string[];
      if (linkIdx >= 0) {
        items = lines.slice(1).map(line => {
          const cols = line.split(',');
          return (cols[linkIdx] ?? '').trim().replace(/^"|"$/g, '');
        }).filter(Boolean);
      } else {
        // No recognised header — treat first column of every non-header line as the value
        items = lines
          .map(line => line.split(',')[0].trim().replace(/^"|"$/g, ''))
          .filter(item => item && identifyProductCode(item));
      }

      if (items.length === 0) {
        toast.error('No valid items found in CSV');
        return;
      }

      setCsvItems(items);
      setCsvFileName(file.name);
      setCsvLog([]);
      setCsvProgress({ current: 0, total: items.length, successful: 0, failed: 0, skipped: 0 });
      toast.success(`Loaded ${items.length} item${items.length !== 1 ? 's' : ''} from CSV`);
    };
    reader.onerror = () => toast.error('Failed to read file');
    reader.readAsText(file);
  };

  const handleCsvFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseCsvFile(file);
    e.target.value = '';
  };

  const handleCsvDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setCsvDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.csv') || file.type === 'text/csv')) {
      parseCsvFile(file);
    } else {
      toast.error('Please drop a .csv file');
    }
  };

  const handleCsvImport = async () => {
    if (csvItems.length === 0) return;

    csvCancelRef.current = false;
    setCsvProcessing(true);
    setCsvLog([]);
    setCsvCurrentItem(null);
    setCsvWaiting(false);
    const progress = { current: 0, total: csvItems.length, successful: 0, failed: 0, skipped: 0 };
    setCsvProgress({ ...progress });

    for (let i = 0; i < csvItems.length; i++) {
      if (csvCancelRef.current) {
        setCsvLog(prev => [...prev, { text: 'Import cancelled.', type: 'info' }]);
        break;
      }

      const item = csvItems[i];
      const identified = identifyProductCode(item);

      if (!identified) {
        progress.skipped++;
        progress.current = i + 1;
        setCsvProgress({ ...progress });
        setCsvLog(prev => [...prev, { text: `[${i + 1}/${csvItems.length}] Skipped — unrecognized: ${item.substring(0, 60)}`, type: 'skip' }]);
        continue;
      }

      // Show live "currently scraping" status
      setCsvCurrentItem({ code: identified.code, type: identified.type, startedAt: Date.now() });

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90000);

        const response = await fetch('/api/scrape-amazon', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: identified.code, identifierType: identified.type }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const result = await response.json();

        if (result.success) {
          progress.successful++;
          const title = result.data?.product?.title?.substring(0, 70) || identified.code;
          setCsvLog(prev => [...prev, { text: `[${i + 1}/${csvItems.length}] ✓ ${title}`, type: 'success' }]);
        } else if (response.status === 409) {
          progress.skipped++;
          setCsvLog(prev => [...prev, { text: `[${i + 1}/${csvItems.length}] — Already exists: ${identified.code}`, type: 'skip' }]);
        } else if (response.status === 404) {
          progress.failed++;
          setCsvLog(prev => [...prev, { text: `[${i + 1}/${csvItems.length}] ✗ Not found on Amazon: ${identified.code}`, type: 'error' }]);
        } else {
          progress.failed++;
          setCsvLog(prev => [...prev, { text: `[${i + 1}/${csvItems.length}] ✗ Failed: ${result.error || identified.code}`, type: 'error' }]);
        }
      } catch (err: any) {
        progress.failed++;
        const msg = err.name === 'AbortError' ? 'timed out after 90s' : err.message;
        setCsvLog(prev => [...prev, { text: `[${i + 1}/${csvItems.length}] ✗ Error (${msg}): ${identified.code}`, type: 'error' }]);
      }

      setCsvCurrentItem(null);
      progress.current = i + 1;
      setCsvProgress({ ...progress });

      // 3s cooldown between requests
      if (i < csvItems.length - 1 && !csvCancelRef.current) {
        setCsvWaiting(true);
        await new Promise(res => setTimeout(res, 3000));
        setCsvWaiting(false);
      }
    }

    setCsvProcessing(false);
    setCsvCurrentItem(null);
    setCsvWaiting(false);
    toast.success(`Done — ${progress.successful} added, ${progress.skipped} skipped, ${progress.failed} failed`);
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

          {/* CSV Import Section */}
          <div className="card p-6 sm:p-8 mt-6">
            <div className="flex items-center space-x-2 mb-5">
              <div className="w-7 h-7 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">CSV Import</h3>
              <span className="text-xs text-gray-400 ml-1">— bulk scrape from file, no limit</span>
            </div>

            {/* Drop zone */}
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
                csvDragOver
                  ? 'border-emerald-400 bg-emerald-50'
                  : 'border-gray-300 hover:border-emerald-400 hover:bg-gray-50'
              }`}
              onClick={() => !csvProcessing && csvFileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setCsvDragOver(true); }}
              onDragLeave={() => setCsvDragOver(false)}
              onDrop={handleCsvDrop}
            >
              <input
                ref={csvFileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleCsvFileInput}
                disabled={csvProcessing}
              />
              {csvFileName ? (
                <div className="space-y-1">
                  <p className="font-medium text-gray-800 text-sm">{csvFileName}</p>
                  <p className="text-emerald-600 font-semibold">{csvItems.length} items loaded</p>
                  <p className="text-xs text-gray-400">Click or drop to replace</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <svg className="w-10 h-10 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-sm text-gray-500">Drop a <span className="font-medium">.csv</span> file here or click to browse</p>
                  <p className="text-xs text-gray-400">Expects a <code className="bg-gray-100 px-1 rounded">Link</code> column with Amazon URLs or ASINs</p>
                </div>
              )}
            </div>

            {/* Progress bar */}
            {(csvProcessing || csvProgress.current > 0) && csvProgress.total > 0 && (
              <div className="mt-4 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-gray-700">
                    {csvProgress.current} / {csvProgress.total}
                    <span className="ml-1 text-gray-400 font-normal">
                      ({Math.round((csvProgress.current / csvProgress.total) * 100)}%)
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-emerald-600 font-medium">{csvProgress.successful} added</span>
                    <span className="text-yellow-600">{csvProgress.skipped} skipped</span>
                    <span className="text-red-500">{csvProgress.failed} failed</span>
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                  <div
                    className={`h-2.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500 ${csvProcessing ? 'relative' : ''}`}
                    style={{ width: `${Math.max(2, Math.round((csvProgress.current / csvProgress.total) * 100))}%` }}
                  />
                </div>
              </div>
            )}

            {/* Live current-item status */}
            {csvProcessing && (
              <div className={`mt-3 rounded-xl px-4 py-3 flex items-center gap-3 text-sm ${
                csvWaiting ? 'bg-gray-100 text-gray-500' : 'bg-blue-50 text-blue-700'
              }`}>
                {csvWaiting ? (
                  <>
                    <svg className="w-4 h-4 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Cooling down 3s before next item…</span>
                  </>
                ) : csvCurrentItem ? (
                  <>
                    <svg className="w-4 h-4 flex-shrink-0 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span className="flex-1 min-w-0">
                      Scraping <span className="font-mono font-semibold">{csvCurrentItem.code}</span>
                      <span className="ml-1 text-blue-400">({csvCurrentItem.type})</span>
                    </span>
                    <span className="flex-shrink-0 tabular-nums text-blue-400 text-xs font-mono">
                      {csvElapsed}s
                    </span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 flex-shrink-0 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>Starting…</span>
                  </>
                )}
              </div>
            )}

            {/* Log — completed items only */}
            {csvLog.length > 0 && (
              <div className="mt-3 bg-gray-950 rounded-xl p-4 max-h-56 overflow-y-auto font-mono text-xs space-y-0.5">
                {csvLog.map((entry, idx) => (
                  <div
                    key={idx}
                    className={
                      entry.type === 'success' ? 'text-emerald-400' :
                      entry.type === 'error'   ? 'text-red-400' :
                      entry.type === 'skip'    ? 'text-yellow-400' :
                                                  'text-gray-500'
                    }
                  >
                    {entry.text}
                  </div>
                ))}
                <div ref={csvLogEndRef} />
              </div>
            )}

            {/* Action button */}
            <div className="mt-4">
              {csvProcessing ? (
                <button
                  onClick={() => { csvCancelRef.current = true; }}
                  className="w-full py-3 rounded-xl font-semibold text-sm bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Stop Import
                  {csvProgress.total > 0 && (
                    <span className="ml-1 opacity-70 font-normal">
                      ({csvProgress.current}/{csvProgress.total})
                    </span>
                  )}
                </button>
              ) : (
                <button
                  onClick={handleCsvImport}
                  disabled={csvItems.length === 0}
                  className="w-full btn-primary py-3 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="flex items-center justify-center space-x-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span>
                      {csvItems.length > 0
                        ? `Start Import (${csvItems.length} item${csvItems.length !== 1 ? 's' : ''})`
                        : 'Upload a CSV first'}
                    </span>
                  </span>
                </button>
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}

