export const ADVERSARIAL_DATA_SEEDING_PROMPT = `<data_seeding>
Every page you test MUST have real data. If a page shows an empty state or no data, populate it with test data before testing.

Adversarial seed values — each record MUST use a different category:
- Unicode stress: German umlauts (äöü), Arabic (مرحبا), CJK (中文), Zalgo (H̷�͈̱̎͌e̶͙̬̎l̸͎̎l̶̙̓ö̶͔)
- Boundary values: 0, -1, 999999999.99, MAX_INT, empty string, very long strings
- Edge dates: Unix epoch (1970-01-01), far future (2099-12-31), invalid dates (2024-02-30)
- Truncation: 100+ char email, 200+ char name, 1000+ char textarea
- Dropdowns: ALWAYS select the LAST option, not the first
- Checkboxes: Test both checked AND unchecked states
- Radio buttons: Test ALL radio options, not just one
- Forms: Submit empty, with invalid data, with valid data

Error handling tests:
- Network errors: Disconnect network and verify error messages
- Validation: Submit invalid forms and verify error messages
- Timeouts: Wait for long operations and verify loading states
- Empty states: Test pages with no data

Security tests:
- XSS: Try <script>alert(1)</script> in input fields
- SQL injection: Try ' OR '1'='1 in search fields
- CSRF: Verify forms have proper tokens

Accessibility:
- Test with keyboard only (no mouse)
- Test with screen reader
- Verify focus indicators visible
- Test color contrast

Responsive:
- Test on mobile viewport (375x667)
- Test on tablet viewport (768x1024)
- Test on desktop (1280x720)
</data_seeding>`;

export const UI_QUALITY_RULES_PROMPT = `<ui_quality_rules>
When your diff touches .css, .scss, .tsx, .jsx, or visual components, you MUST verify:

1. Design System Conformance
   - Check that colors match design tokens
   - Verify typography matches spec
   - Check spacing and layout matches mockups

2. Responsive Design (test ALL 7 viewports)
   - Mobile: 320x568, 375x667, 414x896
   - Tablet: 768x1024, 834x1112
   - Desktop: 1280x720, 1920x1080
   - Verify no horizontal scroll on any viewport

3. Touch Interaction
   - Test that all clickable elements are at least 44x44px
   - Test that interactive elements have proper touch targets
   - Verify hover states don't break on touch devices

4. Cross-Browser (if possible)
   - Test on WebKit (Safari) in addition to Chromium
   - Check for browser-specific rendering issues

5. Dark Mode
   - Verify dark mode styles are implemented
   - Check for proper contrast in dark mode
   - Test that images have proper dark variants

6. Layout Stability (CLS)
   - Verify no layout shift during page load
   - Check that images have dimensions
   - Verify fonts don't cause layout shift

7. Font Loading
   - Verify custom fonts are loaded properly
   - Check for FOUT (Flash of Unstyled Text)
   - Test fallback fonts are appropriate
</ui_quality_rules>`;

export const TESTING_CHECKLIST_PROMPT = `<testing_checklist>
Before marking a test as complete, verify:

□ Page loads without console errors
□ Page loads without JavaScript errors
□ All images load successfully (no broken images)
□ All external resources load (CSS, JS, fonts)
□ Forms show proper validation errors for invalid input
□ Forms submit successfully with valid input
□ Navigation works correctly (all links work)
□ Authentication works (login/logout flow)
□ Error states display properly
□ Loading states display during async operations
□ Empty states display when no data
□ Responsive design works on all viewports
□ Accessibility: keyboard navigation works
□ Accessibility: screen reader compatible
□ Performance: page loads in under 3 seconds
□ Security: no sensitive data in console
□ Network: no failed requests (check console)
</testing_checklist>`;

export function buildAdversarialPrompt(basePrompt: string): string {
  return `${ADVERSARIAL_DATA_SEEDING_PROMPT}\n\n${UI_QUALITY_RULES_PROMPT}\n\n${TESTING_CHECKLIST_PROMPT}\n\n## Your Task\n\n${basePrompt}`;
}
