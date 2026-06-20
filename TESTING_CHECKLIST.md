# ChatWalrus Dashboard - Testing Checklist

**Testing Date:** 2026-06-20
**Tester:** Claude Code
**Environment:** Development

## Phase 1: Branding & UI Polish

### ✅ Logo & Favicon
- [ ] **Favicon**: Visit any page, check browser tab shows ChatWalrus logo (32x32)
- [ ] **Apple Touch Icon**: Check mobile bookmark shows proper icon (180x180)
- [ ] **Navbar Logo**:
  - [ ] Logo displays in navbar (28x28, rounded corners)
  - [ ] Logo loads immediately (loading="eager" set)
  - [ ] Logo is at `/public/chatwalrus_logo.jpeg`

**Test Steps:**
```bash
# Verify files exist
ls -la public/chatwalrus_logo.jpeg
ls -la src/app/favicon.ico
ls -la src/app/apple-icon.png

# Check navbar implementation
grep -n "chatwalrus_logo.jpeg" src/components/layout/Navbar.tsx
grep -n 'loading="eager"' src/components/layout/Navbar.tsx
```

---

## Phase 2: Authentication System

### ✅ Login Page
- [ ] **Route**: Navigate to `/login`
- [ ] **UI Elements**:
  - [ ] Minimalistic design matches dashboard aesthetic
  - [ ] Single passcode input field
  - [ ] Show/hide password toggle
  - [ ] Login button disabled when empty
  - [ ] "Signing in..." state while submitting
- [ ] **Functionality**:
  - [ ] Accepts admin passcode from env var
  - [ ] Redirects admin to `/` after successful login
  - [ ] Shows error message for invalid passcode
  - [ ] Redirect parameter works: `/login?redirect=/admin/settings`

### ✅ Company Passcodes
- [ ] **Database Table**:
  ```sql
  SELECT * FROM passcodes LIMIT 5;
  -- Should show: id, code, role, company_id, description, status
  ```
- [ ] **Login Flow**:
  - [ ] Company passcode redirects to `/company/{slug}`
  - [ ] Invalid passcode shows error
  - [ ] Session cookie created with company scope
- [ ] **Passcode Management UI** (`/admin/settings`):
  - [ ] Table shows all passcodes
  - [ ] Create form visible
  - [ ] Company dropdown populated
  - [ ] Role badge shows "Admin" or "Company"
  - [ ] Delete button works
  - [ ] Refresh after create/delete

### ✅ Session & Middleware
- [ ] **Admin Session**:
  - [ ] Can access `/admin/*` routes
  - [ ] Can access `/company/*` routes
  - [ ] Session expires after configured time
  - [ ] Logout clears session
- [ ] **Company Session**:
  - [ ] Can access `/company/{their-slug}/*`
  - [ ] **Cannot** access `/admin/*` (redirects)
  - [ ] **Cannot** access `/company/{other-slug}` (redirects)
  - [ ] **Cannot** access `/` root (redirects to company)
- [ ] **Session Token**:
  - [ ] Contains role ('admin' | 'company')
  - [ ] Contains companyId for company sessions
  - [ ] Contains companySlug for company sessions
  - [ ] HMAC signed with APP_SESSION_SECRET

**Test Steps:**
```typescript
// Test admin login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"passcode":"ADMIN_PASSCODE"}' \
  -c cookies.txt

// Verify session cookie
cat cookies.txt | grep session

// Test admin can access all routes
curl -b cookies.txt http://localhost:3000/ # Should work
curl -b cookies.txt http://localhost:3000/admin/settings # Should work
curl -b cookies.txt http://localhost:3000/company/test-company # Should work

// Test company login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"passcode":"COMPANY_PASSCODE"}' \
  -c company-cookies.txt

// Test company scoped access
curl -b company-cookies.txt http://localhost:3000/company/their-slug # Should work
curl -b company-cookies.txt http://localhost:3000/admin/settings # Should redirect
curl -b company-cookies.txt http://localhost:3000/company/other-slug # Should redirect
```

---

## Phase 3: Performance Optimization

### ✅ Loading States
- [ ] **Surveys Page** (`/admin/surveys/loading.tsx`):
  - [ ] Shows skeleton while loading
  - [ ] Displays "Loading analytics..." message
  - [ ] Spinner animation working
- [ ] **Navbar Logo**:
  - [ ] `loading="eager"` attribute set
  - [ ] Logo loads immediately on page load
  - [ ] No flicker or delayed load

**Test Steps:**
```bash
# Check loading.tsx exists
ls -la src/app/admin/surveys/loading.tsx

# Verify logo loading priority
grep 'loading="eager"' src/components/layout/Navbar.tsx
```

---

## Phase 4: KPI Enhancements

### ✅ Tooltip Implementation
- [ ] **KpiCard Component** (`src/components/company/KpiCard.tsx`):
  - [ ] Accepts `tooltip` prop
  - [ ] Shows (?) icon when tooltip provided
  - [ ] Tooltip text appears on hover
  - [ ] Tooltip styled correctly
- [ ] **Company Overview Page** (`/company/[slug]/page.tsx`):
  - [ ] Total Enrolled has tooltip
  - [ ] Avg Progress has tooltip
  - [ ] Completed has tooltip
  - [ ] At Risk has tooltip
  - [ ] All other KPIs have descriptive tooltips

**Test Steps:**
```typescript
// Visit company page
http://localhost:3000/company/test-company

// Hover over each KPI card (?) icon
// Verify tooltip text appears and is descriptive
```

---

## Phase 5: Learners Page Enhancements

### ✅ Role Filter
- [ ] **UI**:
  - [ ] Dropdown shows "All Roles" option
  - [ ] Each role shows learner count: "Sales (45)"
  - [ ] Selected role highlights
  - [ ] URL updates: `?role=Sales`
- [ ] **Functionality**:
  - [ ] Filters learners by selected role
  - [ ] "All Roles" shows everyone
  - [ ] Role filter persists on pagination
  - [ ] Works with search and course filters

### ✅ Course Filter Counts
- [ ] **UI**:
  - [ ] Course dropdown shows learner counts
  - [ ] Format: "Course Name (123)"
  - [ ] Counts are accurate
- [ ] **Functionality**:
  - [ ] Counts update when role filter changes
  - [ ] Counts reflect actual enrolled learners

### ✅ Sortable Columns
- [ ] **UI**:
  - [ ] Column headers are clickable
  - [ ] Shows sort arrows: ↑ (asc) ↓ (desc) ↕ (neutral)
  - [ ] Active column highlighted
- [ ] **Sortable Columns**:
  - [ ] Full Name
  - [ ] Email
  - [ ] Department
  - [ ] Title/Role
  - [ ] Courses Enrolled
  - [ ] Avg Progress
  - [ ] Last Active
- [ ] **Functionality**:
  - [ ] First click: ascending
  - [ ] Second click: descending
  - [ ] Third click: back to ascending
  - [ ] Sort persists through filters
  - [ ] URL updates: `?sort_by=avg_progress&sort_dir=desc`

**Test Steps:**
```bash
# Visit learners page
http://localhost:3000/company/test-company/learners

# Test role filter
# 1. Click role dropdown
# 2. Verify counts shown
# 3. Select a role
# 4. Verify URL: ?role=Sales
# 5. Verify table filtered

# Test course counts
# 1. Click course dropdown
# 2. Verify format: "Course Name (123)"
# 3. Select different roles
# 4. Verify counts update

# Test sorting
# 1. Click "Full Name" header
# 2. Verify arrow changes: ↑
# 3. Verify table sorted alphabetically
# 4. Click again
# 5. Verify arrow: ↓
# 6. Verify table sorted reverse
# 7. Repeat for other columns
# 8. Verify URL: ?sort_by=full_name&sort_dir=asc
```

### ✅ API Implementation
- [ ] **Route** (`/api/companies/[slug]/learners`):
  - [ ] Accepts role parameter
  - [ ] Accepts sort_by parameter
  - [ ] Accepts sort_dir parameter
  - [ ] Returns paginated results
- [ ] **Directory Function** (`/lib/learners/directory.ts`):
  - [ ] getRoleOptionsWithCounts() returns roles with counts
  - [ ] addLearnerCountsToCourses() adds counts to courses
  - [ ] Sorting works on all columns
  - [ ] Role filter applied correctly

---

## Phase 6: Courses Page

### ✅ Route & Navigation
- [ ] **Sidebar Link**:
  - [ ] "Courses" appears in CompanySidebar
  - [ ] Book icon displayed
  - [ ] Highlights when active
  - [ ] Navigates to `/company/[slug]/courses`
- [ ] **Page Loads**:
  - [ ] Page renders without errors
  - [ ] Company name shown
  - [ ] "Courses" title visible

### ✅ Course Data Display
- [ ] **Course Cards**:
  - [ ] Course name displayed
  - [ ] Total lessons count shown
  - [ ] Enrollment count (# learners)
  - [ ] Average progress percentage
  - [ ] Completion count + rate
  - [ ] Role distribution badges
- [ ] **Role Distribution**:
  - [ ] Shows all roles enrolled in course
  - [ ] Format: "Sales: 45"
  - [ ] Sorted by count (highest first)
  - [ ] Badge styling consistent

### ✅ Filters & Sorting
- [ ] **Role Filter**:
  - [ ] Buttons for each role
  - [ ] "All Roles" shows all courses
  - [ ] Selecting role shows only courses with that role
  - [ ] Active role highlighted
  - [ ] Count shown: "All Roles (25)"
- [ ] **Sort Controls**:
  - [ ] Name (↑ ↓)
  - [ ] Enrolled (↑ ↓)
  - [ ] Progress (↑ ↓)
  - [ ] Completed (↑ ↓)
  - [ ] Active sort highlighted
  - [ ] URL updates: `?sort_by=enrollment_count&sort_dir=desc`

**Test Steps:**
```bash
# Visit courses page
http://localhost:3000/company/test-company/courses

# Test course display
# 1. Verify all metrics shown
# 2. Check role distribution badges
# 3. Verify completion rate calculation

# Test role filter
# 1. Click "Sales" role button
# 2. Verify URL: ?role=Sales
# 3. Verify only courses with Sales learners shown
# 4. Click "All Roles"
# 5. Verify all courses shown

# Test sorting
# 1. Click "Enrolled" sort
# 2. Verify courses sorted by enrollment count
# 3. Click again (descending)
# 4. Verify highest enrollment first
# 5. Test other sort options
```

### ✅ API Implementation
- [ ] **Route** (`/company/[slug]/courses/page.tsx`):
  - [ ] getCourseData() aggregates enrollments
  - [ ] Calculates role distribution
  - [ ] Computes completion rates
  - [ ] Applies role filter
  - [ ] Applies sorting
- [ ] **Data Quality**:
  - [ ] All courses from enrollments shown
  - [ ] Metrics accurate
  - [ ] No duplicate courses

---

## Phase 7: Survey Analytics

### ✅ Code Verification
- [ ] **All components reviewed** (see SURVEY_ANALYTICS_DIAGNOSTIC.md)
- [ ] **Sync function correct**: `syncSurveys()`
- [ ] **API route correct**: `/api/surveys`
- [ ] **Frontend correct**: `/admin/surveys/page.tsx`
- [ ] **Health check correct**: `/api/admin/settings/status`

### ✅ Manual Testing
- [ ] **Run Survey Sync**:
  - [ ] Navigate to `/admin/settings`
  - [ ] Click "Import Survey Reviews"
  - [ ] Verify status message
  - [ ] Check sync_logs table
- [ ] **Verify Data**:
  ```sql
  -- Check if surveys exist
  SELECT COUNT(*) FROM surveys;

  -- Check latest sync
  SELECT * FROM sync_logs WHERE sync_type = 'surveys' ORDER BY started_at DESC LIMIT 1;
  ```
- [ ] **Test Analytics Page**:
  - [ ] Visit `/admin/surveys`
  - [ ] Verify KPIs display (if data exists)
  - [ ] Check charts render
  - [ ] Test company filter
  - [ ] Test proficiency filter
  - [ ] Verify feedback search works

---

## Phase 8: End-to-End Integration Tests

### ✅ Complete User Flows

#### Flow 1: Admin Login → Full Access
1. [ ] Visit `/login`
2. [ ] Enter admin passcode
3. [ ] Redirected to `/`
4. [ ] Can access `/admin/settings`
5. [ ] Can access all `/company/*` pages
6. [ ] Can run syncs
7. [ ] Can manage passcodes

#### Flow 2: Company Login → Scoped Access
1. [ ] Visit `/login`
2. [ ] Enter company passcode
3. [ ] Redirected to `/company/{slug}`
4. [ ] Can access `/company/{slug}/*` pages
5. [ ] **Cannot** access `/admin/*` (redirects)
6. [ ] **Cannot** access other companies (redirects)
7. [ ] Logout works

#### Flow 3: Learners Page Full Workflow
1. [ ] Navigate to `/company/test-company/learners`
2. [ ] Select a role filter
3. [ ] Select a course filter
4. [ ] Enter search term
5. [ ] Click column header to sort
6. [ ] Navigate to page 2
7. [ ] Verify all filters persist
8. [ ] Verify URL has all parameters

#### Flow 4: Courses Page Full Workflow
1. [ ] Navigate to `/company/test-company/courses`
2. [ ] Select a role filter
3. [ ] Click sort by enrollment
4. [ ] Verify courses reordered
5. [ ] Change sort direction
6. [ ] Select different role
7. [ ] Verify courses filtered

#### Flow 5: Survey Analytics Workflow
1. [ ] Login as admin
2. [ ] Navigate to `/admin/settings`
3. [ ] Run "Import Survey Reviews" sync
4. [ ] Wait for completion
5. [ ] Navigate to `/admin/surveys`
6. [ ] Select company filter
7. [ ] Search feedback
8. [ ] Verify pagination works
9. [ ] Check all charts render

### ✅ Cross-Browser Testing
- [ ] Chrome/Edge (Chromium)
- [ ] Firefox
- [ ] Safari

### ✅ Responsive Design
- [ ] Desktop (1920x1080)
- [ ] Laptop (1366x768)
- [ ] Tablet (768x1024)
- [ ] Mobile (375x667)

### ✅ Performance
- [ ] Initial page load < 3s
- [ ] Navigation feels instant
- [ ] Filters update quickly
- [ ] No layout shifts
- [ ] Images load promptly

### ✅ Accessibility
- [ ] Keyboard navigation works
- [ ] Focus indicators visible
- [ ] Color contrast sufficient
- [ ] ARIA labels present

---

## Regression Testing

### ✅ Existing Features Still Work
- [ ] Dashboard overview loads
- [ ] Weekly reports display
- [ ] Leaderboard works
- [ ] Assessments page loads
- [ ] Sessions page works
- [ ] Interventions page functional
- [ ] Export functionality works
- [ ] Settings page accessible

---

## Bug Tracking

### Issues Found
| # | Severity | Component | Description | Status |
|---|----------|-----------|-------------|--------|
|   |          |           |             |        |

### Notes


---

## Sign-Off

- [ ] All critical tests passing
- [ ] No blocking bugs
- [ ] Documentation updated
- [ ] Ready for deployment

**Tester Signature:** _______________
**Date:** _______________
