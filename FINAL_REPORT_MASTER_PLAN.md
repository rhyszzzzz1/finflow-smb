# Final Report Master Plan

This document is a strict template-compliant writing plan for the final year project report.

Project working title: FinFlow SMB  
Suggested full title: Design and Development of a Web-Based Financial Management System for SMEs in Nepal

Use this document as the master outline for writing the final report in the provided template. Keep the template headings exactly as written by the college. Under each heading, use the project-specific points below.

## 1. Cover Page

Status: `new content`

Include:
- Final project title
- Full name
- Student number
- Course
- Supervisor
- Reader
- Submission date
- Institution name

Checklist:
- Keep project name consistent everywhere
- Use either `FinFlow SMB` or one final approved title throughout the report

## 2. Title and Declaration sheet

Status: `new content`

Include:
- Originality declaration
- Student name and signature
- Submission date
- Title of project

## 3. Abstract

Status: `rewrite`

Target length:
- 300 to 500 words

Write this last.

Cover:
- Problem domain: SMEs in Nepal often rely on spreadsheets, paper records, or fragmented tools
- Proposed solution: a web-based system that integrates KYC, inventory, billing, receivables, payables, settlements, and financial reports
- Method: Agile development with iterative implementation
- Technologies used: React, TypeScript, Tailwind CSS, Express, MySQL, JWT, Multer, Recharts
- Main outcomes: developed working system with accounting and reporting capabilities
- Evaluation summary: testing performed, key findings, strengths and limitations

Strong closing line:
- Mention that the project demonstrates how an affordable, integrated digital platform can improve financial visibility and operational efficiency for SMEs

## 4. Contents

Status: `template generated`

Use Word automatic table if possible.

## 5. Table of Contents

Status: `template generated`

If the template separates `Contents` and `Table of Contents`, follow the template format exactly.

## 6. Table of Figures

Status: `reuse and update`

Include existing and new figures:
- System architecture diagram
- Functional decomposition diagram
- Use case diagram
- Activity diagrams
- ERD
- Sequence diagrams
- Data flow diagram
- Wireframes
- Product backlog
- Sprint backlog
- Updated UI screenshots
- Database schema screenshots
- Dashboard and reports screenshots
- Gantt chart
- Testing evidence tables or screenshots

## 7. Introduction [Write this section in parallel with the system development]

Status: `rewrite`

Target:
- 1.5 to 2 pages

Purpose:
- Introduce the importance of software artefacts, digital financial systems, and the SME context
- Transition from general problem domain to this exact project

Project-specific talking points:
- SMEs often struggle with disconnected financial processes
- Manual bookkeeping reduces visibility and increases errors
- Existing tools can be expensive, overly complex, or poorly localized for Nepalese SME needs
- This project develops an integrated web-based financial management platform

Avoid:
- Long generic definitions of software projects
- Outdated proposal wording that no longer matches the built system

## 8. Project briefing

Status: `rewrite`

Target:
- 2 to 3 pages

Explain:
- The business problem being addressed
- Why SMEs need a centralized finance and inventory platform
- Who the intended users are
- The practical value of integrating multiple financial functions in one place

Project-specific system summary:
- User registration and authentication
- Business verification through KYC uploads
- Inventory management
- Sales invoice management
- Purchase bill management
- Receivables and payables tracking
- Payment allocation and settlement flows
- Financial reporting including trial balance, profit and loss, balance sheet, aging summaries, and stock reports

Good framing sentence:
- The system evolved from an early dashboard concept into a modular financial operations platform for SMEs.

## 9. Aims [Should have already been completed but update as per necessary]

Status: `rewrite`

Target:
- 0.5 to 1 page

Write one broad aim, then optionally a short explanatory paragraph.

Suggested aim:
- To design, develop, and evaluate a web-based financial management system that helps SMEs in Nepal manage inventory, billing, receivables, payables, and financial reporting through an integrated and user-friendly platform.

## 10. Objectives [Should have already been completed but update as per necessary]

Status: `rewrite`

Target:
- 1 page

Use clear measurable objectives.

Suggested objectives:
- To investigate the financial management challenges faced by SMEs and identify gaps in existing digital tools.
- To design a modular system architecture for inventory, billing, receivables, payables, KYC verification, and financial reporting.
- To implement a responsive web application using React for the frontend and Express with MySQL for the backend.
- To support sales invoices, purchase bills, payment allocation, and inventory operations within a unified workflow.
- To generate accounting outputs such as trial balance, profit and loss, balance sheet, aging reports, and stock reports.
- To evaluate the system through functional, integration, usability, and validation testing.
- To critically assess the strengths, limitations, and future development opportunities of the project.

## 11. Artefact [Should have already been completed but update as per necessary]

Status: `reuse and update`

Target:
- 1.5 to 2 pages

Explain the artefact as the final implemented system, not the proposed idea.

Describe:
- Type of artefact: web-based financial management system
- Intended users: SME owners, finance staff, administrators
- Main modules
- Access control and KYC dependency
- Expected benefits: centralization, traceability, reporting, improved decision-making

## 12. FDD (Functional Decomposition Diagram)

Status: `new content or update existing diagram`

Target:
- 1 page plus explanation

Top-level functions:
- User and authentication management
- KYC and verification
- Inventory management
- Sales management
- Purchase management
- Receivables and payables
- Payments and settlements
- Accounting and reports
- Administration and audit support

Write-up should explain:
- Whole system
- Each subsystem
- Why decomposition helped development and modularity

## 13. Academic Question [Should have already been completed but update as per necessary]

Status: `rewrite`

Target:
- 0.5 to 1 page

Suggested refined academic question:
- How can a web-based integrated financial management system improve the efficiency, visibility, and accuracy of inventory, billing, receivables, payables, and financial reporting processes for SMEs in Nepal while remaining cost-effective and user-friendly?

Then explain:
- Why this question matters academically and practically
- How the report will answer it through design, implementation, and evaluation

## 14. Scope and Limitation of the project [Write this section in parallel with the system development]

Status: `rewrite`

Target:
- 1.5 to 2 pages

Scope:
- Web-based platform for SME financial operations
- User authentication and KYC document upload
- Inventory master and stock operations
- Sales invoices and purchase bills
- Receivable and payable tracking
- Payment application and settlements
- Accounting reports and dashboards

Limitations:
- No mobile native app
- Limited formal automated test suite
- May not cover full statutory accounting compliance for all business cases
- Limited real-world deployment scale
- Depends on stable internet and correct data entry
- Evaluation may rely heavily on manual and scenario-based testing unless more user testing is added

Be honest and concrete.

## 15. Report Structure [When all the major portion of the report is completed - at the end]

Status: `new content`

Target:
- 0.5 to 1 page

Write this near the end.

Describe each major section of the report in order using the exact template headings.

## 16. Literature Review [Initial review should have been completed. For the detail report, write this section in parallel with the system development]

Status: `reuse and expand`

Target:
- 10 to 12 pages

Existing source:
- `138_2408970_RhysMaharjan_Literature_Review.pdf`

Keep the current sections and expand them with more comparison and critique.

Recommended subsection flow:
- Introduction to the review
- Cloud accounting adoption in SMEs
- Inventory and accounting integration
- Receivables and cash-flow management
- Security, privacy, and regulatory compliance
- Usability and onboarding for SMEs
- Comparative analysis of existing systems
- Research gap
- Chapter conclusion

To get higher marks:
- Compare academic papers with industry tools
- Critically evaluate, not just summarize
- Show how literature influenced system decisions
- Build directly toward your academic question

## 17. Project Methodology [Before starting the system development]

Status: `rewrite`

Target:
- 4 to 5 pages

Template warning:
- Focus on why Agile was chosen, not generic definitions

Write about:
- Why Agile suited a modular SME project
- Why iterative delivery was useful as scope evolved
- Why feedback-oriented development was needed for usability-heavy features
- How backlog and milestones were used
- How system complexity increased from proposal to final build

Include:
- One high-level Gantt or milestone figure
- Sprint or phase overview

Good subsections:
- Methodology selection and justification
- Why Agile over Waterfall
- Iterative delivery strategy
- Risk reduction through incremental development
- Milestones

## 18. Different Technology and Tools used for the project [in parallel with the system development]

Status: `rewrite`

Target:
- 4 to 6 pages

Important:
- Justify tools you actually used
- Remove proposal-era alternatives you did not end up using

Actual stack from repo:
- Frontend: React, TypeScript, Vite, Tailwind CSS, shadcn-ui, Recharts
- Backend: Express, Node.js
- Database: MySQL
- Auth and security: JWT, bcryptjs, CORS
- File upload: Multer
- Notifications: Nodemailer
- Validation: custom validators
- State/data fetching: React Query
- Development tools: Git, npm, ESLint, VS Code or your actual IDE

Write for each:
- What it was used for
- Why it was chosen
- Why it suited the project better than alternatives

Also include:
- Package manager
- Database environment
- Deployment or local dev environment if relevant

## 19. Artefact Designs [in parallel with the system development]

Status: `reuse and heavily expand`

Target:
- 3 to 4 pages intro before subsystem sections

Use this as the transition into deliverable-based design and implementation discussion.

Include:
- Overview of how the system was broken into subsystems
- Why modularization was used
- Relationship between diagrams, implementation, and testing

Then split into subsystem sections exactly as the template expects.

## 20. <Sub System 1> / Deliverable 1 (recommended) / Milestone 1

Status: `rewrite`

Suggested title:
- Sub System 1: Authentication, User Profile and KYC Verification

Target:
- 5 to 6 pages

Cover:
- SRS for this subsystem
- Use case summary
- Activity diagram for onboarding and KYC submission
- Wireframes or screenshots
- Data model tables related to users and KYC
- Backend flow for upload and verification
- Restrictions before approval
- Testing done on KYC upload, validation, and state changes

Good screenshots:
- Signup
- Login
- KYC upload form
- Verification status banner
- Admin review interface if available

## 21. SRS

Status: `new content under each subsystem`

For each subsystem include:
- Functional requirements
- Non-functional requirements
- Inputs
- Outputs
- Business rules
- Constraints

Example for KYC:
- Users must upload required documents
- Only accepted file formats are allowed
- File size must remain within allowed threshold
- Verification status affects access to core features

## 22. All the design/modelling diagrams

Status: `reuse and update`

Include for subsystem 1 where relevant:
- Use case diagram
- Activity diagram
- Sequence diagram
- Data flow diagram
- Wireframes

Explain each diagram briefly:
- What it shows
- Why it was created
- How it informed implementation

## 23. Testing

Status: `new content under each subsystem`

Include:
- Test cases table
- Inputs
- Expected result
- Actual result
- Outcome

For subsystem 1 test:
- Valid KYC uploads
- Invalid file types
- Oversized file uploads
- Unverified user access restrictions
- Auth success and failure

## 24. Sub System 2 / Deliverable 2 / Milestone 2

Status: `rewrite`

Suggested title:
- Sub System 2: Inventory Management and Stock Control

Target:
- 5 to 6 pages

Cover:
- Inventory item creation and updates
- Warehouse and item structures if implemented
- Vendor-linked products
- Stock balances
- Stock adjustment and transfer flows
- CSV or bulk upload capability if still relevant to your final build
- Related database tables and diagrams
- Testing scenarios

Relevant repo evidence:
- `src/components/Inventory/BulkUploadDialog.tsx`
- `finflow-backend/routes/inventoryRoutes.js`
- inventory services, validators, repository

## 25. Repeat

Status: `required`

Use this pattern for additional major subsystems.

Recommended additional subsystem sections:

- Sub System 3: Sales Invoices and Receivables Management
Cover:
- Invoice lifecycle: draft, approve, post, void
- Customer balances
- Outstanding invoices
- Aging of receivables
- Dashboard impact

- Sub System 4: Purchase Bills and Payables Management
Cover:
- Bill lifecycle
- Vendor balances
- Outstanding purchases
- Aging of payables

- Sub System 5: Payments, Settlement, and Allocation Engine
Cover:
- Payment application flow
- Allocation logic
- Settlement behavior
- Protection against invalid derived writes

- Sub System 6: Accounting Engine and Financial Reporting
Cover:
- Journal logic
- Trial balance
- Profit and loss
- Balance sheet
- Stock summary and stock ledger
- Customer and vendor statements
- Dashboard visualizations

For each subsystem include:
- SRS
- diagrams
- implementation summary
- screenshots
- testing evidence

## 26. If system implementing AI

Status: `not applicable unless supervisor requires note`

Write only if needed:
- This project does not implement AI components; therefore AI-specific analysis is outside the project scope.

## 27. Conclusion [After the system development is completed]

Status: `new content`

Target:
- 2 to 3 pages

Directly revisit:
- Aim
- Objectives
- Academic question

Discuss:
- What was achieved
- What the system demonstrates
- How well the project addressed SME needs
- Whether the academic question was answered

End with a clear concluding statement on the value of an integrated SME finance platform.

## 28. Critical Evaluation of the Project [After the system development is completed]

Status: `new content`

Target:
- 3 to 4 pages

High-mark content:
- What worked well technically
- What design decisions were successful
- Where the implementation was strong
- Weaknesses in scope, testing, polish, or deployment
- Constraints during development
- Tradeoffs between complexity and usability
- Data integrity and accounting reliability considerations

Suggested subsections:
- Evaluation of design decisions
- Evaluation of implementation quality
- Evaluation of testing approach
- Practical limitations
- Future improvements

Future work ideas:
- Role-based access expansion
- More robust audit logging
- Better automated tests
- Exportable reports
- Deployment and multi-tenant hardening
- Better localization and tax support for Nepal

## 29. Findings and process

Status: `new content under critical evaluation`

Use as a subsection if the template or supervisor expects it.

Discuss:
- What the project revealed about SME system needs
- What development process decisions were effective
- Where requirements changed
- How modular design supported growth

## 30. System too

Status: `new content under critical evaluation`

Interpret this as:
- evaluate the system itself, not just the report

Discuss:
- usability
- maintainability
- extensibility
- performance in realistic usage
- practical business usefulness

## 31. Planning, management, quality of sources found, etc.

Status: `new content under critical evaluation`

Discuss:
- whether the planning was realistic
- where schedules slipped or changed
- source quality in literature review
- how sources shaped implementation decisions

## 32. You should also include a section on Self-reflection.

Status: `new content`

Target:
- 1.5 to 2 pages

Write in first person if your department accepts it.

Discuss:
- what you learned technically
- what you learned about software design
- what you learned about financial systems
- how your writing and research improved
- professional growth
- time management and project management lessons

## 33. Evidence of Project Management [No word count for this section]

Status: `new content and evidence collection`

This section is essential.

Include:
- Log sheets signed and scanned by supervisor
- Updated Gantt chart
- Milestone tracking
- Product backlog
- Sprint backlog
- Meeting notes or summaries
- Risk log if available

Best subsection structure:
- 33.1 Log Sheet
- 33.2 Gantt Chart
- 33.3 Milestones and Deliverables
- 33.4 Backlog and Sprint Evidence
- 33.5 Reflection on Project Management

## 34. Log Sheet - Signed and Scanned by supervisor [Continuous work as per supervisor meeting]

Status: `evidence required`

Collect:
- scanned signed meeting sheets
- dates
- actions agreed
- progress notes

## 35. Gantt Chart [Update as per necessary]

Status: `new or updated evidence`

Include:
- original planned phases
- final revised phases if schedule changed
- visual timeline

Recommended milestones:
- Proposal and initial research
- Literature review
- Artefact design
- Database and architecture
- Frontend development
- Backend development
- Reporting module
- Testing and evaluation
- Final documentation

## 36. Reference and Bibliography [No word count for this section]

Status: `reuse and clean up`

Use:
- Harvard style consistently
- one citation style everywhere

Requirements:
- academic papers
- books or academic sources where possible
- official documentation for technologies
- legal/regulatory references if mentioned

Avoid:
- random blogs unless clearly justified
- inconsistent citation formats

## 37. Appendices [in parallel during system development] [No world count for this section]

Status: `new content and evidence collection`

Recommended appendices:
- Appendix A: User manual
- Appendix B: System configuration and setup
- Appendix C: Test cases and raw testing results
- Appendix D: Additional screenshots
- Appendix E: Database schema details
- Appendix F: Sample outputs and reports
- Appendix G: Gantt chart and backlog evidence
- Appendix H: Supervisor log sheets

## 38. User manual for your system (For end user) if needed

Status: `new content`

Include:
- how to register and log in
- how to upload KYC
- how to manage inventory
- how to create invoices and bills
- how to apply payments
- how to view reports

Use screenshots.

## 39. System configuration detail, if needed

Status: `new content`

Include:
- frontend and backend setup
- environment variables
- database setup
- required packages
- how to run locally

Project references:
- `.env`
- `package.json`
- `finflow-backend/package.json`
- `SETUP_GUIDE.md`
- SQL schema and migration files

## 40. Client approval/proof letter if it is a prestigious project

Status: `optional`

Only include if you have one.

## 41. Feasibility test document if you have produced

Status: `optional but useful`

If you have any early validation, include it.

## 42. Cost estimation document if have produced

Status: `optional`

Could include:
- estimated development costs
- hosting assumptions
- maintenance considerations

## 43. Survey form and its data if have undertaken and used

Status: `optional but high value`

If you can collect even small feedback:
- user survey
- usability feedback
- supervisor or peer review responses

This can strengthen the evaluation chapter.

---

# Reuse Map From Existing Reports

## Proposal PDF

Source:
- `C:\fyp\2408970_RhysMaharjan_ProjectProposal.pdf`

Reuse for:
- project briefing
- early background
- aims
- objectives
- academic question
- initial schedule

Needs work:
- remove broken formatting and bookmark issues
- update scope to match final system
- remove technologies not finally used

## Literature Review PDF

Source:
- `C:\fyp\138_2408970_RhysMaharjan_Literature_Review.pdf`

Reuse for:
- literature review chapter

Needs work:
- expand critique
- strengthen comparison
- connect literature to design decisions

## Artefact Design PDF

Source:
- `C:\fyp\138_2408970_RhysMaharjan_Artefact_Design.pdf`

Reuse for:
- artefact
- FDD
- system architecture
- use case
- activity diagrams
- ERD
- sequence diagrams
- wireframes
- backlog evidence

Needs work:
- update diagrams if implementation changed
- add implementation outcomes, not just design intent

## Professionalism PDF

Source:
- `C:\fyp\138_2408970_RhysMaharjan_Professionalism.pdf`

Reuse for:
- critical evaluation
- ethics
- legal
- security
- self-reflection support

Needs work:
- rename system consistently
- tighten academic tone in places
- connect legal and security discussion to final implementation choices

---

# Project-Specific Technical Points To Mention

Use these in the relevant sections so the report matches the real system:

- React and TypeScript frontend
- Express backend with route/controller/service structure
- MySQL database with schema and migration files
- JWT-based authentication
- KYC file upload using Multer
- Inventory routes for items, warehouses, stock balances, adjustments, transfers
- Sales invoice lifecycle with draft, approve, post, and void actions
- Purchase bill lifecycle with draft, approve, post, and void actions
- Receivables and payables aging
- Payment allocation logic
- Settlement support
- Accounting engine and journal handling
- Trial balance generation
- Profit and loss report generation
- Balance sheet generation
- Stock summary and stock ledger
- Dashboard analytics and charts
- Validation middleware and custom validators

---

# Page Planning Guide

Use this to stay within 70 to 80 pages excluding references and appendices.

- Front matter: 5 to 7 pages
- Introduction to report structure section block: 8 to 10 pages
- Literature review: 10 to 12 pages
- Methodology: 4 to 5 pages
- Technology and tools: 4 to 6 pages
- Artefact designs and subsystem chapters: 22 to 30 pages
- Conclusion: 2 to 3 pages
- Critical evaluation and self-reflection: 5 to 7 pages
- Project management: extra
- References: extra
- Appendices: extra

---

# Highest Priority Missing Content

These are the sections most likely to decide the final grade if they are weak:

1. Testing evidence
2. Updated implementation details
3. Critical evaluation
4. Project management evidence
5. Consistent academic writing and formatting

---

# Fastest Writing Order

Write in this order:

1. Project briefing
2. Aim
3. Objectives
4. Academic question
5. Scope and limitation
6. Technology and tools
7. Methodology
8. Artefact overview and FDD
9. Subsystem sections
10. Testing
11. Critical evaluation
12. Conclusion
13. Abstract
14. Report structure

---

# Final Quality Checklist

Before submission confirm:

- Template headings are unchanged
- Project name is consistent
- Aim, objectives, and academic question align with final system
- Every major subsystem has design and testing evidence
- Screenshots are clear and labeled
- References are consistent Harvard style
- Tables and figures are numbered correctly
- Conclusion answers the academic question
- Critical evaluation is honest and specific
- Appendices contain supporting evidence
