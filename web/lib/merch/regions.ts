// Minimal region data for the storefront shipping estimator. Printful requires a
// state_code for US/CA/AU; other countries only need the country code.

export type Region = { code: string; label: string }

/** Common destination countries. "Other" countries fall back to checkout. */
export const SHIPPING_COUNTRIES: Region[] = [
  { code: 'US', label: 'United States' },
  { code: 'CA', label: 'Canada' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'AU', label: 'Australia' },
  { code: 'DE', label: 'Germany' },
  { code: 'FR', label: 'France' },
  { code: 'NL', label: 'Netherlands' },
  { code: 'ES', label: 'Spain' },
  { code: 'IT', label: 'Italy' },
  { code: 'IE', label: 'Ireland' },
  { code: 'SE', label: 'Sweden' },
  { code: 'NZ', label: 'New Zealand' },
  { code: 'JP', label: 'Japan' },
  { code: 'MX', label: 'Mexico' },
]

/** Countries where Printful requires a state/province code for a rate quote. */
export const STATE_REQUIRED = new Set(['US', 'CA', 'AU'])

export const US_STATES: Region[] = [
  { code: 'AL', label: 'Alabama' }, { code: 'AK', label: 'Alaska' }, { code: 'AZ', label: 'Arizona' },
  { code: 'AR', label: 'Arkansas' }, { code: 'CA', label: 'California' }, { code: 'CO', label: 'Colorado' },
  { code: 'CT', label: 'Connecticut' }, { code: 'DE', label: 'Delaware' }, { code: 'DC', label: 'District of Columbia' },
  { code: 'FL', label: 'Florida' }, { code: 'GA', label: 'Georgia' }, { code: 'HI', label: 'Hawaii' },
  { code: 'ID', label: 'Idaho' }, { code: 'IL', label: 'Illinois' }, { code: 'IN', label: 'Indiana' },
  { code: 'IA', label: 'Iowa' }, { code: 'KS', label: 'Kansas' }, { code: 'KY', label: 'Kentucky' },
  { code: 'LA', label: 'Louisiana' }, { code: 'ME', label: 'Maine' }, { code: 'MD', label: 'Maryland' },
  { code: 'MA', label: 'Massachusetts' }, { code: 'MI', label: 'Michigan' }, { code: 'MN', label: 'Minnesota' },
  { code: 'MS', label: 'Mississippi' }, { code: 'MO', label: 'Missouri' }, { code: 'MT', label: 'Montana' },
  { code: 'NE', label: 'Nebraska' }, { code: 'NV', label: 'Nevada' }, { code: 'NH', label: 'New Hampshire' },
  { code: 'NJ', label: 'New Jersey' }, { code: 'NM', label: 'New Mexico' }, { code: 'NY', label: 'New York' },
  { code: 'NC', label: 'North Carolina' }, { code: 'ND', label: 'North Dakota' }, { code: 'OH', label: 'Ohio' },
  { code: 'OK', label: 'Oklahoma' }, { code: 'OR', label: 'Oregon' }, { code: 'PA', label: 'Pennsylvania' },
  { code: 'RI', label: 'Rhode Island' }, { code: 'SC', label: 'South Carolina' }, { code: 'SD', label: 'South Dakota' },
  { code: 'TN', label: 'Tennessee' }, { code: 'TX', label: 'Texas' }, { code: 'UT', label: 'Utah' },
  { code: 'VT', label: 'Vermont' }, { code: 'VA', label: 'Virginia' }, { code: 'WA', label: 'Washington' },
  { code: 'WV', label: 'West Virginia' }, { code: 'WI', label: 'Wisconsin' }, { code: 'WY', label: 'Wyoming' },
]

export const CA_PROVINCES: Region[] = [
  { code: 'AB', label: 'Alberta' }, { code: 'BC', label: 'British Columbia' }, { code: 'MB', label: 'Manitoba' },
  { code: 'NB', label: 'New Brunswick' }, { code: 'NL', label: 'Newfoundland and Labrador' },
  { code: 'NS', label: 'Nova Scotia' }, { code: 'NT', label: 'Northwest Territories' }, { code: 'NU', label: 'Nunavut' },
  { code: 'ON', label: 'Ontario' }, { code: 'PE', label: 'Prince Edward Island' }, { code: 'QC', label: 'Quebec' },
  { code: 'SK', label: 'Saskatchewan' }, { code: 'YT', label: 'Yukon' },
]

export const AU_STATES: Region[] = [
  { code: 'ACT', label: 'Australian Capital Territory' }, { code: 'NSW', label: 'New South Wales' },
  { code: 'NT', label: 'Northern Territory' }, { code: 'QLD', label: 'Queensland' },
  { code: 'SA', label: 'South Australia' }, { code: 'TAS', label: 'Tasmania' },
  { code: 'VIC', label: 'Victoria' }, { code: 'WA', label: 'Western Australia' },
]

export function statesForCountry(country: string): Region[] {
  if (country === 'US') return US_STATES
  if (country === 'CA') return CA_PROVINCES
  if (country === 'AU') return AU_STATES
  return []
}
