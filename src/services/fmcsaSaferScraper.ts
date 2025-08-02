// FMCSA SAFER Web Scraping Service
// Alternative to official API - scrapes public SAFER database

interface SaferCompanyData {
  dotNumber: string;
  legalName: string;
  dbaName?: string;
  physicalAddress: string;
  mailingAddress?: string;
  phone: string;
  safetyRating?: string;
  safetyRatingDate?: string;
  operatingStatus: string;
  numberOfDrivers?: number;
  numberOfPowerUnits?: number;
  carrierOperationType?: string;
  insuranceRequired?: string;
  insuranceOnFile?: string;
  bondInsuranceOnFile?: string;
  cargoInsuranceOnFile?: string;
  lastUpdated: string;
}

interface SaferSearchResult {
  success: boolean;
  data?: SaferCompanyData;
  error?: string;
  source: 'safer_web_scrape';
}

export class FMCSASaferScraper {
  // Based on python-safer library endpoints
  private readonly SAFER_QUERY_URL = 'http://www.safersys.org/query.asp';
  private readonly SAFER_SNAPSHOT_URL = 'https://safer.fmcsa.dot.gov/CompanySnapshot.aspx';
  
  // Rate limiting to be respectful to DOT servers
  private lastRequestTime = 0;
  private readonly MIN_REQUEST_INTERVAL = 2000; // 2 seconds between requests
  
  /**
   * Search for carrier information by DOT number
   */
  async searchByDOTNumber(dotNumber: string): Promise<SaferSearchResult> {
    try {
      // Validate DOT number format
      if (!dotNumber || dotNumber.trim() === '') {
        return {
          success: false,
          error: 'DOT number is required',
          source: 'safer_web_scrape'
        };
      }
      
      // Clean up DOT number (remove any non-digits)
      const cleanDotNumber = dotNumber.replace(/\D/g, '');
      if (cleanDotNumber.length < 1) {
        return {
          success: false,
          error: 'Invalid DOT number format',
          source: 'safer_web_scrape'
        };
      }
      
      await this.respectRateLimit();
      
      console.log(`🔍 Searching SAFER database for DOT: ${cleanDotNumber} (original: ${dotNumber})`);
      
      // Method 1: Try query endpoint first
      let result = await this.queryEndpoint(cleanDotNumber);
      
      // Method 2: If that fails, try company snapshot
      if (!result.success) {
        result = await this.companySnapshot(cleanDotNumber);
      }
      
      return result;
      
    } catch (error) {
      console.error('SAFER scraping error:', error);
      return {
        success: false,
        error: `Failed to fetch data from SAFER: ${error instanceof Error ? error instanceof Error ? error.message : String(error) : String(error)}`,
        source: 'safer_web_scrape'
      };
    }
  }
  
  /**
   * Method 1: Query the SAFER query endpoint (based on python-safer approach)
   */
  private async queryEndpoint(dotNumber: string): Promise<SaferSearchResult> {
    try {
      // Based on python-safer library: use safersys.org endpoint
      const formData = new URLSearchParams({
        query_type: 'queryCarrierSnapshot',
        query_param: 'USDOT',
        query_string: dotNumber,
        query_name: ''
      });
      
      console.log(`🌐 Querying safersys.org for DOT: ${dotNumber}`);
      
      const response = await fetch(this.SAFER_QUERY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate'
        },
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const html = await response.text();
      const parsedData = this.parseQueryResponse(html, dotNumber);
      
      if (parsedData) {
        return {
          success: true,
          data: parsedData,
          source: 'safer_web_scrape'
        };
      } else {
        return {
          success: false,
          error: 'No data found for this DOT number',
          source: 'safer_web_scrape'
        };
      }
      
    } catch (error) {
      console.error('Query endpoint error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        source: 'safer_web_scrape'
      };
    }
  }
  
  /**
   * Method 2: Try the Company Snapshot interface
   */
  private async companySnapshot(dotNumber: string): Promise<SaferSearchResult> {
    try {
      const searchUrl = `${this.SAFER_SNAPSHOT_URL}?query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${dotNumber}`;
      
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const html = await response.text();
      const parsedData = this.parseSnapshotResponse(html, dotNumber);
      
      if (parsedData) {
        return {
          success: true,
          data: parsedData,
          source: 'safer_web_scrape'
        };
      } else {
        return {
          success: false,
          error: 'No data found in company snapshot',
          source: 'safer_web_scrape'
        };
      }
      
    } catch (error) {
      console.error('Company snapshot error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        source: 'safer_web_scrape'
      };
    }
  }
  
  /**
   * Parse HTML response from query endpoint (based on python-safer patterns)
   */
  private parseQueryResponse(html: string, dotNumber: string): SaferCompanyData | null {
    try {
      // Check for "No records found" or similar messages first
      if (html.toLowerCase().includes('no records') || 
          html.toLowerCase().includes('no data found') ||
          html.toLowerCase().includes('not found')) {
        console.log(`📋 No SAFER records found for DOT: ${dotNumber}`);
        return null;
      }
      
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      let companyData: Partial<SaferCompanyData> = {
        dotNumber,
        lastUpdated: new Date().toISOString(),
        operatingStatus: 'Unknown'
      };
      
      // SAFER uses specific table structures - look for data in table cells
      const tables = doc.querySelectorAll('table');
      
      // Parse table data - SAFER uses nested tables
      for (const table of tables) {
        const rows = table.querySelectorAll('tr');
        
        for (const row of rows) {
          const cells = row.querySelectorAll('td, th');
          
          // Look for patterns in the HTML structure
          for (let i = 0; i < cells.length - 1; i++) {
            const labelCell = cells[i];
            const valueCell = cells[i + 1];
            
            const label = labelCell.textContent?.trim().toLowerCase() || '';
            const value = valueCell.textContent?.trim() || '';
            
            // Skip empty values
            if (!value || value === '' || value === '-') continue;
            
            // Map SAFER fields to our data structure (based on python-safer patterns)
            if (label.includes('legal name') || label.includes('entity name')) {
              companyData.legalName = value;
            } else if (label.includes('dba name') || label.includes('operating') && label.includes('name')) {
              companyData.dbaName = value;
            } else if (label.includes('physical address')) {
              companyData.physicalAddress = this.cleanAddress(value);
            } else if (label.includes('mailing address')) {
              companyData.mailingAddress = this.cleanAddress(value);
            } else if (label.includes('phone')) {
              companyData.phone = value;
            } else if (label.includes('safety rating')) {
              companyData.safetyRating = value;
            } else if (label.includes('operating status') || label.includes('carrier operation')) {
              companyData.operatingStatus = value;
            } else if (label.includes('drivers') && !label.includes('out')) {
              companyData.numberOfDrivers = this.parseNumber(value);
            } else if (label.includes('power units') || label.includes('trucks')) {
              companyData.numberOfPowerUnits = this.parseNumber(value);
            } else if (label.includes('carrier operation')) {
              companyData.carrierOperationType = value;
            }
          }
        }
      }
      
      // Validate required fields
      if (companyData.legalName && companyData.physicalAddress) {
        return companyData as SaferCompanyData;
      }
      
      return null;
      
    } catch (error) {
      console.error('HTML parsing error:', error);
      return null;
    }
  }
  
  /**
   * Parse HTML response from company snapshot
   */
  private parseSnapshotResponse(html: string, dotNumber: string): SaferCompanyData | null {
    try {
      // Similar parsing logic but for snapshot page format
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Check for "No data found" messages
      if (html.toLowerCase().includes('no data found') || 
          html.toLowerCase().includes('no records found')) {
        return null;
      }
      
      // Extract company information from snapshot format
      let companyData: Partial<SaferCompanyData> = {
        dotNumber,
        lastUpdated: new Date().toISOString()
      };
      
      // Use more flexible text extraction for snapshot page
      const textContent = doc.body?.textContent || html;
      
      // Extract using regex patterns for snapshot page
      const patterns = {
        legalName: /Legal Name[:\s]+([^\n\r]+)/i,
        dbaName: /DBA Name[:\s]+([^\n\r]+)/i,
        phone: /Phone[:\s]+([\d\-\(\)\s]+)/i,
        safetyRating: /Safety Rating[:\s]+([^\n\r]+)/i,
        operatingStatus: /Operating Status[:\s]+([^\n\r]+)/i
      };
      
      for (const [key, pattern] of Object.entries(patterns)) {
        const match = textContent.match(pattern);
        if (match && match[1]) {
          (companyData as any)[key] = match[1].trim();
        }
      }
      
      // Set defaults for required fields
      if (!companyData.legalName) companyData.legalName = 'Unknown Carrier';
      if (!companyData.physicalAddress) companyData.physicalAddress = 'Address Not Available';
      if (!companyData.operatingStatus) companyData.operatingStatus = 'Unknown';
      
      return companyData as SaferCompanyData;
      
    } catch (error) {
      console.error('Snapshot parsing error:', error);
      return null;
    }
  }
  
  /**
   * Rate limiting to be respectful to DOT servers
   */
  private async respectRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
      const waitTime = this.MIN_REQUEST_INTERVAL - timeSinceLastRequest;
      console.log(`Rate limiting: waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }
  
  /**
   * Batch search multiple DOT numbers with proper rate limiting
   */
  async batchSearch(dotNumbers: string[]): Promise<SaferSearchResult[]> {
    const results: SaferSearchResult[] = [];
    
    console.log(`Starting batch search for ${dotNumbers.length} DOT numbers`);
    
    for (let i = 0; i < dotNumbers.length; i++) {
      const dotNumber = dotNumbers[i];
      console.log(`Processing ${i + 1}/${dotNumbers.length}: DOT ${dotNumber}`);
      
      const result = await this.searchByDOTNumber(dotNumber);
      results.push(result);
      
      // Extra delay for batch operations
      if (i < dotNumbers.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log(`Batch search completed: ${results.filter(r => r.success).length} successful`);
    return results;
  }
  
  /**
   * Helper method to clean address data
   */
  private cleanAddress(address: string): string {
    return address.replace(/\s+/g, ' ').trim();
  }
  
  /**
   * Helper method to parse numbers from text
   */
  private parseNumber(text: string): number {
    const match = text.match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
  }
  
  /**
   * Check if SAFER website is accessible
   */
  async checkSaferAvailability(): Promise<boolean> {
    try {
      const response = await fetch(this.SAFER_QUERY_URL, {
        method: 'HEAD'
      });
      return response.ok;
    } catch (error) {
      console.error('SAFER availability check failed:', error);
      return false;
    }
  }
}

export const fmcsaSaferScraper = new FMCSASaferScraper();