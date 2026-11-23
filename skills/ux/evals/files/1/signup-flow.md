# Sign-up flow as built (release candidate)

Product: a shared task board for small teams. About one sign-up in three is a
person trying the product alone before bringing a team in.

A bar at the top of every step reads "Step N of 6".

## Step 1: Email

- One field, "Work email", and a "Continue" button.
- The address is checked while the person types. A wrong format shows, under
  the field: "That doesn't look like an email address. Check for a missing @."
- Spaces before or after the address are removed without comment.

## Step 2: Verify code

- Text: "We sent a 6-digit code to dana@example.com." One code field and a
  "Verify" button.
- The code stops working after 10 minutes.
- A wrong or expired code shows "Error 4012" and nothing else.
- There is no "send it again" link and no way to change the email address.
  The browser's Back button returns to Step 1 with the field empty.

## Step 3: Profile

- Full name, job title, phone number, company size, profile photo. All five
  are required.
- "Continue" stays grey until all five are filled. Nothing says which one is
  missing.

## Step 4: Workspace name

- Field label: "Tenant slug".
- Allowed: 3 to 20 lowercase letters, digits and hyphens. This rule is not
  shown on the screen.
- Anything else shows "Invalid input" after the person presses "Continue".

## Step 5: Invite teammates

- Text: "Add at least one teammate's email to continue."
- "Continue" stays grey until one address is entered. There is no "Skip" and
  no "Later".

## Step 6: Dashboard

- The board opens with no tasks. The page is blank apart from the top menu.
