# Jira Awesomizer Defaults
---------
Are you tired of typing in the same things over and over again when you create a new issue in JIRA?  Do you feel like a lab monkey, but you do not identify as a monkey? If so, then JIRA Awesomizer Defaults is for you!

What is it?
----------------
A TamperMonkey (GreaseMonkey) script that fills in fields automatically when you create a new Issue. This script adds a "Save" icon next to each field in the "Create Issue" screens. Saved values are stored locally in the browser.

![Jira Awesomizer screenshot](img/screenshot.png?raw=true "Screenshot")

What fields does it support?
------------
Every field I could find and test against, including multi-select and single-select. Tested with versions 8.22.

How to Install
------------
1. Install TamperMonkey in Chrome (Works with FF too)
1. In Chrome, visit https://github.com/SethSilverBeard/jira-awesomizer-defaults/raw/master/jira-awesomizer-defaults.user.js and click "Install"
1. Go to your JIRA website. You should see JIRA Awesomizer in the TamperMonkey options: ![image](https://user-images.githubusercontent.com/15022238/164320319-cce2680d-9a57-4e9f-b110-4cd32d154a87.png). If not, update the script's `@include` directive to match your website URL pattern.
1. In JIRA, choose "Create Issue" button. You should see a lock icon next to each field to save it!


FAQs
----------
1. **Shouldn't JIRA have this already?**

Yes! But they don't. It's been 13 years since someone requested this feature: https://jira.atlassian.com/browse/JRASERVER-4812. Rather than wait umpteen more years, I've created one for everyone to use today.

2. **It's not working!**

By default, JIRA Awesomizer is only enabled on websites that start with jira*. If your website doesn't match this pattern, update the `@include` directive in the script to match your JIRA website. 

If this still doesn't work, help me debug! Open F12 Developer Tools in chrome, then click "Manually execute JIRA Awesomizer" from TamperMonkey menu. Please include any output from the Chrome console and open an issue with me or send email to me (see screenshot for email address).

3. **Can I exclude fields from getting a save button?**

Yes, but you'll need to locally edit a line in the TamperMonkey script. Add the field name to the `excludedFields` variable at the top of the script. Currently excluded fields:
```javascript
var excludedFields = ['Project', 'Issue Type', 'Summary', 'Create another'];
```

4. **Can I change defaults based on Issue Type or similar?**

No, currently this only supports a single set of defaults across your JIRA instance.
