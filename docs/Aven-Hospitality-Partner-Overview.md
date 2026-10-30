# HouseKeepAI — Connectivity Partner Overview  
**Prepared for:** Aven Hospitality / SynXis Platform Partnership Evaluation  
**Contact:** Kalpesh Patel · HouseKeepAI  
**Date:** October 2026  
**One page**

---

## 1. Company

**HouseKeepAI** builds modern hotel operations software for housekeeping, front desk, inspections, and maintenance teams. We help independent and branded hotels run daily room turnover on web and mobile, with clear room status, assignments, and accountability—without replacing the property’s PMS of record.

We are seeking certified connectivity to **Aven Hospitality’s SynXis** platform so SynXis Property Hub hotels can keep HouseKeepAI and SynXis room status in sync through supported APIs rather than manual exports or unsupported screen automation.

---

## 2. Product

HouseKeepAI is a hotel operations platform that includes:

- Live room board (dirty / cleaning / clean / inspected / OOO) for housekeepers, head housekeepers, and front desk  
- Mobile workflows for housekeepers and inspectors (checklists, photos, mark clean / ready to inspect)  
- Front desk tools (VIP, rush, block, move, mark clean/dirty)  
- Maintenance, guest requests, inventory, laundry, lost & found, and operational reporting  
- Optional AI assists for cleaning priority and staffing suggestions  
- PMS connectivity so room housekeeping status stays aligned with the hotel’s system of record  

**Intended SynXis integration (SynXis Property Hub – Rooms API):**

| Capability | SynXis API (from published Rooms specification) |
|------------|--------------------------------------------------|
| Read room HK / occupancy / OOO / OOI status | `POST /sph/rooms/status` |
| Update housekeeping status (dirty / clean) | `POST /sph/rooms/housekeeping-status` |
| Room inventory context (as needed) | `GET /sph/rooms/guest-rooms` |

HouseKeepAI would use these endpoints only for **operational room status sync**—not for reservations shopping, rates, or CRS booking flows.

---

## 3. Business problem we solve

Hotels using SynXis still run housekeeping on phones, paper, or disconnected apps. Staff mark rooms clean in one place while SynXis / Property Hub stays stale until someone re-enters status—causing delayed check-in readiness, front-desk callbacks, and lost productivity.

**HouseKeepAI closes that gap:** housekeepers and supervisors work in a purpose-built HK app; status changes flow back to SynXis so the PMS board and the floor team stay aligned.

---

## 4. Intended benefit / outcomes (vs. generic competitors)

| Outcome for SynXis hotels | Why it matters |
|---------------------------|----------------|
| Faster room readiness visibility | Front desk sees Clean/Dirty aligned with SynXis Property Hub |
| Fewer double-entry errors | Mark Clean in HouseKeepAI updates SynXis HK status via API |
| Mobile-first HK execution | Checklists, photos, inspection—beyond a CRS status grid |
| Multi-property ops consistency | Same HK workflows across hotels that also use SynXis |
| Supported integration path | Uses Aven/SynXis published Rooms APIs—not brittle portal scraping |

We are not a competing CRS or channel manager. We are an **operations layer** that makes SynXis more valuable for housekeeping and front-desk execution on property.

---

## 5. Partnership ask & customer demand

We respectfully request evaluation as a **SynXis connectivity partner** for the **Property Hub Rooms** APIs (status read + housekeeping status update), including certification environment access (`services-c1` / `services-c2` as applicable), vendor code, and onboarding guidance.

In parallel, we will ask mutual / prospective SynXis hotel clients to express interest through their **Aven Account Manager**, as requested.

**Primary use case for certification:** bi-directional housekeeping room status sync for SynXis Property Hub hotels using HouseKeepAI.

---

*Thank you for considering HouseKeepAI. We are ready to complete partner onboarding, certify against the Rooms API specification, and support Aven hotel customers who need modern housekeeping workflows alongside SynXis.*
