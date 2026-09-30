# Project notes

## FiWi Place website (`fiwi-place/`)

- Every form on the site (booking, quote, and any form added later) must send
  completed submissions to **fiwiplacejaofficial@gmail.com**. Use the shared
  `FORM_ENDPOINT` in `fiwi-place/js/main.js`
  (`https://formsubmit.co/ajax/fiwiplacejaofficial@gmail.com`) and the
  `.form-page` setup there, rather than adding a new email service.
- When the site goes live, check this before announcing it:
  - The live domain uses the same endpoint.
  - One test submission is sent from the live site.
  - The owner clicks FormSubmit's one-time activation email in that inbox.
  Forms only deliver after activation.
