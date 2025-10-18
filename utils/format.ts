export function formatPrice(price?: number): string {
  if (price === undefined || price === null) {
    return 'N/A';
  }
  return `$${price.toFixed(2)}`;
}

export function formatDate(dateString?: string): string {
  if (!dateString) return 'N/A';
  
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

