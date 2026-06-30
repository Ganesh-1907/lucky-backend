const DECIMAL_FIELDS = new Set([
  'basePrice', 'discountPrice', 'avgRating', 'commissionRate',
  'totalEarnings', 'price', 'value', 'minOrder', 'maxDiscount',
  'baseAmount', 'addonsAmount', 'couponDiscount', 'totalAmount',
  'advancePaid', 'remainingAmount', 'commission', 'amount', 'refundAmount',
]);

const JSON_STRING_FIELDS = new Set([
  'images', 'tags', 'cities', 'serviceCities', 'selectedAddons', 'config', 'metadata',
]);

export function serialize<T>(data: T): T {
  if (data === null || data === undefined) return data;

  if (Array.isArray(data)) {
    return data.map(item => serialize(item)) as T;
  }

  if (typeof data === 'object' && !(data instanceof Date)) {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(data as Record<string, any>)) {
      if (DECIMAL_FIELDS.has(key) && typeof value === 'string') {
        result[key] = parseFloat(value);
      } else if (JSON_STRING_FIELDS.has(key) && typeof value === 'string') {
        try {
          result[key] = JSON.parse(value);
        } catch {
          result[key] = value;
        }
      } else if (typeof value === 'object' && value !== null) {
        result[key] = serialize(value);
      } else {
        result[key] = value;
      }
    }
    return result as T;
  }

  return data;
}
