'use client'
import { useState, FormEvent } from 'react'
import Combobox from '@/components/ui/Combobox'

const CATEGORIES = [
  'Dentist', 'Doctor', 'Chiropractor', 'Optometrist', 'Physical Therapist', 'Veterinarian',
  'Plumber', 'Electrician', 'HVAC', 'Roofer', 'Painter', 'Landscaper', 'Flooring',
  'Auto Repair', 'Car Dealership', 'Cleaning Service', 'Pest Control',
  'Restaurant', 'Bakery', 'Coffee Shop', 'Bar',
  'Lawyer', 'Accountant', 'Financial Advisor', 'Insurance Agent', 'Mortgage Broker',
  'Real Estate Agent', 'Hair Salon', 'Barber', 'Nail Salon', 'Gym', 'Yoga Studio',
  'Marketing Agency', 'Web Designer', 'Photographer',
]

const CITIES = [
  // East Bay
  'Pleasanton, CA', 'Dublin, CA', 'Livermore, CA', 'San Ramon, CA', 'Danville, CA',
  'Fremont, CA', 'Newark, CA', 'Union City, CA', 'Hayward, CA', 'Castro Valley, CA',
  'San Leandro, CA', 'Oakland, CA', 'Berkeley, CA', 'Emeryville, CA', 'Alameda, CA',
  'Walnut Creek, CA', 'Concord, CA', 'Pleasant Hill, CA', 'Lafayette, CA', 'Orinda, CA',
  'Moraga, CA', 'Martinez, CA', 'Antioch, CA', 'Brentwood, CA', 'Oakley, CA',
  'Pittsburg, CA', 'Hercules, CA', 'Richmond, CA', 'El Cerrito, CA', 'Albany, CA',
  'Alamo, CA', 'Blackhawk, CA', 'San Lorenzo, CA', 'Ashland, CA',
  // South Bay / Peninsula
  'San Jose, CA', 'Santa Clara, CA', 'Sunnyvale, CA', 'Mountain View, CA', 'Palo Alto, CA',
  'Menlo Park, CA', 'Redwood City, CA', 'Foster City, CA', 'San Mateo, CA', 'Burlingame, CA',
  'Millbrae, CA', 'Daly City, CA', 'San Bruno, CA', 'South San Francisco, CA', 'Cupertino, CA',
  'Campbell, CA', 'Los Gatos, CA', 'Saratoga, CA', 'Los Altos, CA', 'Milpitas, CA',
  // North Bay
  'San Francisco, CA', 'Marin City, CA', 'San Rafael, CA', 'Novato, CA', 'Petaluma, CA',
  'Santa Rosa, CA', 'Napa, CA', 'Vallejo, CA', 'Fairfield, CA',
  // Other major US
  'Los Angeles, CA', 'San Diego, CA', 'Sacramento, CA', 'Fresno, CA',
  'Seattle, WA', 'Portland, OR', 'Las Vegas, NV', 'Phoenix, AZ',
  'Denver, CO', 'Austin, TX', 'Dallas, TX', 'Houston, TX',
  'Chicago, IL', 'New York, NY', 'Miami, FL', 'Atlanta, GA',
]

interface Props {
  onSearch: (category: string, city: string) => void
  loading: boolean
}

export default function SearchForm({ onSearch, loading }: Props) {
  const [category, setCategory] = useState('')
  const [city, setCity] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (category.trim() && city.trim()) onSearch(category.trim(), city.trim())
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-3 flex-wrap">
      <Combobox
        options={CATEGORIES}
        value={category}
        onChange={setCategory}
        placeholder="Business category"
      />
      <Combobox
        options={CITIES}
        value={city}
        onChange={setCity}
        placeholder="City"
      />
      <button
        type="submit"
        disabled={loading || !category || !city}
        className="kayna-btn transition-colors disabled:opacity-50"
        style={{
          background: 'var(--color-accent)',
          color: '#080808',
          fontFamily: "'Inter', sans-serif",
          fontWeight: 500,
          fontSize: 13,
          padding: '9px 22px',
          borderRadius: 5,
          border: 'none',
          cursor: 'pointer',
        }}
      >
        {loading ? 'Searching…' : 'Search'}
      </button>
    </form>
  )
}
