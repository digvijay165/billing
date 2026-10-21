<div align="center">

# 🧾 ForgeFlow: Workshop Billing

### *Fast, simple GST billing for machine-parts workshops.*

A browser-based billing app where each shop **uploads its own MRP price list**. Type a part number, press Enter, and the MRP and GST fill in automatically. Stock, purchases, expenses, GST reports, staff logins and cloud sync are built in.

[![Live App](https://img.shields.io/badge/🚀_Live_App-Open_ForgeFlow-1e5c45?style=for-the-badge)](https://digvijay165.github.io/billing/)

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![IndexedDB](https://img.shields.io/badge/Storage-IndexedDB-0f172a?style=flat-square)
![GitHub Pages](https://img.shields.io/badge/Hosted_on-GitHub_Pages-222222?style=flat-square&logo=github&logoColor=white)
![No Install](https://img.shields.io/badge/Install-None_Required-success?style=flat-square)

**[🌐 Live App](https://digvijay165.github.io/billing/)** · **[🐛 Report Bug](https://github.com/digvijay165/billing/issues)** · **[✨ Request Feature](https://github.com/digvijay165/billing/issues)**

<br>

<a href="https://digvijay165.github.io/billing/">
  <img src="forgeflow-screenshot.png" alt="ForgeFlow dashboard" width="100%">
</a>

</div>

---

## 📖 About

**ForgeFlow** is billing software built for a real machine-parts workshop. It replaces handwritten bills and price-list lookups with a fast, clean web app. It works on its own in the browser with no sign-up, or with optional **cloud sync and staff logins** (Supabase) so the whole shop shares one set of bills across phones and computers.

It reads your company's **MRP Excel list** (kept private to your shop), creates proper **GST invoices**, remembers customers, and can share bills on **WhatsApp** in one click.

> 🔗 **Try it live:** [digvijay165.github.io/billing](https://digvijay165.github.io/billing/)

---

## ✨ Features

### ⚡ Billing
| Feature | Description |
| --- | --- |
| 🔍 **Instant part lookup** | Search your uploaded price list by part number or description right from the Home page |
| 📚 **Multiple price lists** | Keep one MRP list per company or brand; search, replace, rename or remove each one |
| ⌨️ **Type & Enter billing** | Enter a part number and the MRP and GST rate fill in automatically |
| ➕ **Smart quantities** | Adding the same part again increases its quantity |
| 🔧 **Labour & extras** | Add labour lines, discounts, and notes to any bill |
| 👥 **Customer memory** | Past customers' details fill in as you type their name |
| 📝 **Estimates / quotations** | Make an estimate, then convert it to a bill in one click |
| 💵 **Part payments** | Record advances and part payments; bills show received and balance due |
| 📲 **UPI QR on bills** | Every unpaid bill shows a scan-to-pay QR for the exact balance |
| 📋 **Copy a bill** | Start a new bill with the same customer and items |

### 🧾 GST Invoices
| Feature | Description |
| --- | --- |
| 💰 **GST-inclusive MRP** | MRP treated as tax-inclusive by default, with taxable value calculated |
| 🏛️ **CGST / SGST / IGST** | Correct tax split for intra-state and inter-state bills |
| 🔢 **Round off & amount in words** | Printed bills show round off and the total in words |
| 🖨️ **Print / PDF** | Print bills or save them as PDF, with a GST breakup by rate |

### 📦 Stock, Purchases & Expenses
| Feature | Description |
| --- | --- |
| 📦 **Stock tracking** | Stock goes down with every bill and up with every purchase, with low-stock alerts |
| 🧮 **Stock count** | Count a shelf and correct the number in seconds |
| 🚚 **Purchases** | Record supplier bills; GST paid counts as input credit in reports |
| 💸 **Expenses** | Rent, salary, electricity and more, by category |

### 📊 Reports
| Feature | Description |
| --- | --- |
| 🧾 **GST summary** | Output GST by rate (CGST / SGST / IGST), input credit, and net GST |
| 🏢 **GSTR-1 helpers** | B2B bill list and B2C summary by rate, exportable to Excel |
| 📅 **Day by day** | Sales and money collected for each day |
| 💹 **Profit** | Rough profit: sales − purchases − expenses for any period |

### ☁️ Cloud & Team (optional)
| Feature | Description |
| --- | --- |
| 🔐 **Login** | Email and password sign-in, with password reset |
| 👷 **Staff accounts** | Staff make bills and take payments, but can't delete, see reports, or change settings |
| 🔄 **Live sync** | Bills made on one device appear on the others instantly |
| 📴 **Works offline** | Installable on your phone; changes sync when you're back online |

### 📤 Sharing & Data
| Feature | Description |
| --- | --- |
| 💬 **WhatsApp & Email** | Share a bill summary in one click |
| 📊 **CSV export** | Export bills to CSV for accounts |
| 📥 **Excel price-list upload** | Upload next month's MRP list (`.xlsx` / `.csv`); it's read directly in the browser |
| 💾 **Backup & restore** | Move all bills and settings to another device |
| 📈 **Dashboard** | Pending and collected amounts, bill count, customers, and a 6-month billing chart |

---

## 🗂️ App Sections

| Section | What it does |
| --- | --- |
| 🏠 **Home** | Price checker, key stats, recent bills, and billing chart |
| 🧾 **Bills** | Bills and estimates: create, edit, print, take payments |
| ⚙️ **Price list & parts** | Built-in MRP list, Excel uploads, and labour charges |
| 📦 **Stock** | Parts on your shelves, low-stock alerts, stock counts |
| 🚚 **Purchases** | Supplier bills; raise stock automatically |
| 💸 **Expenses** | Shop running costs *(owner only)* |
| 👥 **Customers** | Customer list built automatically from your bills |
| 📊 **Reports** | Sales, GST, collections and profit *(owner only)* |
| 🏢 **Business settings** | Shop details, GST, UPI, team, and backup / restore *(owner only)* |

---

## 🛠️ Tech Stack

- **HTML5, CSS3, Vanilla JavaScript**: a single-page app with no frameworks
- **localStorage / IndexedDB**: the local copy of bills and the uploaded price list, so the app works offline
- **Supabase** (optional): login, Postgres database with row-level security for staff roles, realtime sync
- **Service worker**: offline use and install-to-home-screen
- **Native Excel reader**: parses `.xlsx` in the browser using `DecompressionStream`, with no external libraries
- **GitHub Pages**: static hosting

---

## 📁 Project Structure

```
billing/
├── index.html                 # The app (UI, styles, and logic)
├── config.js                  # Supabase keys (empty = local-only mode)
├── js/cloud.js                # Login, staff roles, and cloud sync
├── supabase/schema.sql        # Database tables and security rules
├── sw.js, manifest.json       # Offline support and phone install
├── SETUP.md                   # How to turn on cloud sync
├── forgeflow-screenshot.png   # README preview image
└── README.md
```

---

## 🚀 Getting Started

### Use it online
Just open the **[live app](https://digvijay165.github.io/billing/)**. Nothing to install.

### Run locally

```bash
git clone https://github.com/digvijay165/billing.git
cd billing
python -m http.server 8000
```

Then open `http://localhost:8000`.

> 💡 Use a local server instead of opening `index.html` directly, so the offline cache and login work.

---

## 🔄 Updating the Price List

No price list is built in. The shop owner goes to **Price list & parts** and uploads the MRP Excel file (columns like *Material, Desc, MRP, GST rate*). With cloud sync on, the list belongs to that shop only: staff get it on every device, and other shops can't see it. Upload again whenever a new list arrives; old bills keep their prices.

---

## ☁️ Cloud Sync & Staff Logins

Cloud sync is **off by default**. To turn it on, follow **[SETUP.md](SETUP.md)** (about 10 minutes, free Supabase plan).

## 🔒 Data & Privacy

- **Local mode** (default): bills, customers, and settings stay **only in the browser** on the device you use
- **Cloud mode**: data is stored in **your own** Supabase project; database rules allow only members of your shop to read it
- Uploaded price lists are read **locally** in the browser. In cloud mode each shop's list (part numbers and MRPs) is private to that shop; other shops can't read it
- Use **Business settings → Download backup** for a file copy of everything

> ⚠️ In local mode, clearing browser data deletes your bills. The app reminds you to back up every 7 days.

---

## 🌐 Deployment

| Setting | Value |
| --- | --- |
| Live URL | [digvijay165.github.io/billing](https://digvijay165.github.io/billing/) |
| Host | GitHub Pages |
| Source | `main` branch, `/ (root)` |
| Build command | *None* |

---

## 🗺️ Roadmap

- [x] Cloud sync across devices
- [x] Multi-user access for staff
- [x] Stock / inventory tracking
- [x] GST reports (GSTR-1 helpers)
- [x] Installable offline app (PWA)
- [ ] HSN codes on bills
- [ ] Send bill PDF directly on WhatsApp

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

1. Fork the project
2. Create your branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m "Add AmazingFeature"`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 👤 Author

**Digvijay Singh**
- GitHub: [@digvijay165](https://github.com/digvijay165)
- Portfolio: [digvijay165.github.io/portfolio](https://digvijay165.github.io/portfolio/)

---

<div align="center">

⭐ **If this project helped you, give it a star!** ⭐

Made with ❤️ by [Digvijay Singh](https://github.com/digvijay165)

</div>
