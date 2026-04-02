// Nepali localization utilities

export const formatCurrency = (amount: number): string => {
  const value = Number.isFinite(amount) ? amount : 0;
  return `Rs. ${value.toLocaleString('en-NP', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export const formatDate = (date: string | Date): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleDateString('en-GB'); // DD/MM/YYYY format
};

export const formatNumber = (num: number): string => {
  return num.toLocaleString('ne-NP');
};
