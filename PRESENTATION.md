# SysMonitor - Presentation Notes

## Overview
**SysMonitor** is a real-time network monitoring dashboard for managing NetBird VPN connections across distributed sites. It provides visibility into site health, tunnel status, and connectivity metrics through a modern, cyberpunk-inspired interface.

---

## Key Features

### 1. Real-Time Site Monitoring
- Live NetBird peer connection status
- Automatic site discovery and synchronization
- Visual status indicators (Online/Offline)
- Last seen tracking with "Online now" for connected sites

### 2. Regional Site Organization
- Sites grouped by geographic regions (Western One/Two, Lower River, etc.)
- Quick filtering and search capabilities
- Region-based site management

### 3. Security Features
- **Access Code Protection**: Password required for adding new sites and opening existing sites
- Access code stored securely in Firestore with real-time updates
- Input validation and sanitization for security
- NetBird IP addresses hidden throughout UI for security

### 4. Health Check & Probing
- On-demand HTTP/HTTPS probing for site connectivity
- TCP port health checks (port 443)
- Latency measurement with sparkline visualizations
- Automated batch health checks

### 5. Historical Data & Reporting
- 24-hour uptime tracking with visual history graphs
- Daily statistics aggregation
- Site availability trends and patterns
- Export capabilities for reports

### 6. Notification System
- Desktop notifications for site status changes
- Telegram bot integration for alerts
- Configurable notification preferences
- Real-time alert delivery

### 7. Site Provisioning & Onboarding
- Automated NetBird setup key generation
- Device type selection (Linux, pfSense, Docker)
- Step-by-step installation wizard
- Automatic site approval workflow

### 8. Dark-Themed Cyberpunk UI
- Phosphor green accent color scheme
- Monospace fonts for technical aesthetic
- CRT-style visual effects
- Responsive grid layouts

---

## Technical Architecture

### Frontend
- **Framework**: React + TypeScript + TanStack Router
- **Styling**: Tailwind CSS with custom cyberpunk theme
- **State Management**: TanStack Query (React Query) for server state
- **Build Tool**: Vite for fast development

### Backend / Desktop
- **Electron**: Cross-platform desktop application
- **Secure Storage**: OS-level encryption for API keys (DPAPI/Keychain)
- **Node.js**: TCP health checks, HTTP probing (bypasses browser CSP)

### Cloud Services
- **Firebase/Firestore**: Real-time data synchronization
- **NetBird API**: VPN peer management
- **Netlify**: Deployment and hosting

### Data Sync
- Auto-sync interval: **1 minute** (configurable)
- Real-time Firestore listeners for access codes
- Offline-capable with local caching

---

## Use Cases

1. **IT Operations**: Monitor distributed network infrastructure
2. **Healthcare**: Monitor clinics/hospitals across regions (Western One/Two, Lower River, etc.)
3. **Remote Work**: Track VPN connectivity for remote sites
4. **Service Providers**: Manage client site connectivity

---

## Demo Flow (Suggested)

1. **Dashboard Overview** (30 sec)
   - Show main dashboard with regional site grouping
   - Highlight status indicators and "Online now" feature

2. **Security Demo** (1 min)
   - Click "Add New Site" → Show access code prompt
   - Try incorrect password → Show error
   - Enter correct code → Access granted
   - Demonstrate "Open Site" button also requires code

3. **Site Details** (1 min)
   - Click a site → Show detail modal
   - Point out hidden NetBird IP (security feature)
   - Show metrics: Tunnel, Region, Tags, Last Seen
   - Demo HTTP probe functionality

4. **Health Monitoring** (30 sec)
   - Show latency sparklines
   - Navigate to Reports page
   - Show daily stats and uptime history

5. **Notifications** (30 sec)
   - Show Telegram integration (if configured)
   - Mention desktop notifications for status changes

---

## Security Highlights

- **Access Control**: Two-factor protection via access code for sensitive actions
- **Data Privacy**: NetBird IPs never exposed in UI
- **Secure Storage**: API keys encrypted at OS level
- **Input Validation**: All access codes validated and sanitized
- **Real-time Updates**: Access code changes propagate immediately

---

## Questions & Answers

**Q: Can I change the access code?**
A: Yes, update the `password` field in Firestore `access_key/main` document. Changes take effect immediately.

**Q: How often does it sync?**
A: By default, every 1 minute for NetBird peer data.

**Q: Can I monitor sites without NetBird?**
A: SysMonitor is specifically designed for NetBird VPN infrastructure.

**Q: Is there a mobile app?**
A: Currently desktop (Electron) and web versions available.

---

*Built with ❤️ for reliable network monitoring*
