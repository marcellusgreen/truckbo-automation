import { ParsedVIN } from '../types';
import { VIN_LENGTH, VIN_REGEX, SAMPLE_CSV_CONTENT, CSV_HEADERS } from '../constants';

export const validateVIN = (vin: string): boolean => {
  if (!vin || typeof vin !== 'string') return false;
  const cleanVIN = vin.toUpperCase().trim();
  return cleanVIN.length === VIN_LENGTH && VIN_REGEX.test(cleanVIN);
};

export const parseCSVFile = async (file: File): Promise<ParsedVIN[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n').map(line => line.trim()).filter(line => line);

        const parsedVINs: ParsedVIN[] = [];
        lines.forEach((line, index) => {
          const columns = line.split(',').map(col => col.trim().replace(/['"]/g, ''));
          const potentialVIN = columns[0];

          if (index === 0 && potentialVIN.toLowerCase() === CSV_HEADERS.VIN) {
            return;
          }

          if (potentialVIN) {
            parsedVINs.push({
              vin: potentialVIN.toUpperCase(),
              isValid: validateVIN(potentialVIN),
              row: index + 1
            });
          }
        });

        resolve(parsedVINs);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
};

export const downloadSampleCSV = () => {
  const csvContent = SAMPLE_CSV_CONTENT;

  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = 'vin_sample.csv';
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
};