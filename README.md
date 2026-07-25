# Smart Voting Machine — Dashboard v3

Two separate pages: public results + password-protected admin panel.

---

## 📁 Files
```
index.html   ← PUBLIC page (anyone can view)
admin.html   ← ADMIN page (password required)
style.css    ← Shared styles
shared.js    ← Shared logic (fetch, charts, confetti)
public.js    ← Public page logic
admin.js     ← Admin page logic
README.md    ← This file
```

---

## 👥 Who Sees What

### Public (index.html) — No Login
- Live vote counts for all 3 parties
- Percentage bars + pie chart + trend line chart
- Voter turnout bar
- Winner/leading party banner
- Election timer countdown
- Election closed banner (when admin ends it)
- Candidate photos (set by admin)
- Dark/Light mode toggle

### Admin (admin.html) — Password Required
Default password: **`admin123`** ← Change in Config tab!

**Dashboard tab** — Full view + activity log + notifications
**Config tab** — ThingSpeak channel, party names, voters, change password
**Verify Vote tab** — Enter any Hash ID to confirm a vote was recorded; full hash table
**Export tab** — PDF / Excel / CSV download + Email report
**Candidates tab** — Upload photos per party
**Election tab** — Set end timer, End election (triggers confetti), Reset local data

---

## 🚀 Quick Start
1. Extract ZIP → Open `index.html` to see public view
2. Open `admin.html` → Enter `admin123`
3. Go to **Config tab** → Enter Channel ID + Read API Key → Save
4. Done! Data loads automatically on both pages.

---

## 🔐 Security Notes
- Admin password stored in localStorage (browser only)
- Session login uses sessionStorage (expires when tab closes)
- Change default password immediately in Config tab

## 🔌 ThingSpeak Fields
- Field 1 → Party A votes
- Field 2 → Party B votes
- Field 3 → Party C votes
