import Sidebar from '@/components/Sidebar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <Sidebar />
      <main style={{ marginLeft: 210, minHeight: '100vh', padding: '2rem' }}>
        {children}
      </main>
    </div>
  )
}
