# Jira Awesomizer Defaults
---------
Are you tired of typing in the same things over and over again when you create a new issue in JIRA?  Do you feel like a lab monkey, but you do not identify as a monkey? If so, then JIRA Awesomizer Defaults is for you!

What is it?
----------------
A TamperMonkey (GreaseMonkey) script that fills in fields automatically when you create a new Issue. This script adds a "Save" icon next to each field in the "Create Issue" screens. Saved values are stored locally in the browser. 

![Jira Awesomizer screenshot](img/screenshot.png?raw=true "Screenshot")

What fields does it support?
------------
Every field I could find and test against, including multi-select and single-select. Tested with versions 7.3.4 - 7.6.0

How to Install
------------
1. Install TamperMonkey in Chrome (Should work with FF, but havent tested)
1. In Chrome, visit https://github.com/SethSilverBeard/jira-awesomizer-defaults/raw/master/jira-awesomizer-defaults.user.js and click "Install"
1. Go to your JIRA website and click "Create Issue". You will see a lock icon next to each field to save it!
1. If you do not see lock icons, you probably need to change the `@include` directive in the script to match your URL. Currently it only matches URLS starting with `jira*.*`


FAQs
----------
1. Shouldn't JIRA have this already?

Yes! But they don't. It's been 13 years since someone requested this feature: https://jira.atlassian.com/browse/JRASERVER-4812. Rather than wait umpteen more years, I've created one for everyone to use today.

2. It's not working!

Try running it manually by clicking the TamperMonkey icon and "Manually execute Jira Awesomizer!".  If this works, you probably need to update your `@include` directive in the script to match your JIRA website.
