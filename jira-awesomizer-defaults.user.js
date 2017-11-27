// ==UserScript==
// @name         Jira Awesomizer Defaults
// @namespace    https://github.com/SethSilverBeard
// @version      1.0.0
// @description  Automatically fills in common JIRA values and allows you to override defaults
// @author       SethSilverBeard
// @require      https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/6.18.2/babel.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/babel-polyfill/6.16.0/polyfill.js
// @require      https://use.fontawesome.com/8fca914d55.js
// @include      http://jira.*
// @include      https://jira.*
// @run-at       document-idle
// @grant        GM_log
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// ==/UserScript==

/* jshint ignore:start */
var inline_src = (<><![CDATA[
  /* jshint ignore:end */
  /* jshint esnext: false */
  /* jshint esversion: 6 */
  
  class AwesomeDefault {
    constructor(label, text, value) {
      this.label = label;  //Label users see, such as 'Sprint', 'Division', 'Original Estimate', etc
      this.text = text;  //Text as user sees it
      this.value = value;  //Value set which corresponds with text value above
      
      //DOM inputs corresponding to above, these arent ever serialized
      this.labelNode = ''; //label node
      this.textNode = '';  //node corresponding to textbox
      this.valueNode = '';  //backend node corresponding to visual textNode. May be same as textNode.
      
      this.saveButton = '';
      this.getContainer = function() {
        //parent is different depending if you're using "All" or "Custom" under "Configure Fields" button
        if (this.labelNode.parentElement.parentElement.id === 'qf-field-' + this.labelNode.getAttribute("for")) {
          return this.labelNode.parentElement.parentElement;
        }
        return this.labelNode.parentElement;
      };
      this.getVal = function() {
        return AJS.$(this.valueNode).val();
      };
      this.getText = function() {
        //gotta do gymnastics to get the actual text for things like "Sprint 5, Sprint 6" etc
        let possibleArray = AJS.$(this.textNode).siblings(".representation").find('.value-text').map(function() { return AJS.$(this).text(); }).get();
        if (possibleArray.length) {
          return possibleArray;
        }
        return this.textNode.value;
      };
    }
  }

var excludedFields = ['Project', 'Issue Type', 'Summary', 'Create another'];
GM_addStyle('.green { color:green;}');
GM_addStyle('.red { color:red;}');
GM_registerMenuCommand('Manually execute Jira Awesomizer!', main);

//put the Jira backing object as a "data" element on the field so can access it later.  Good for fancy fields like multi-select and single-select
AJS.$('#jira').on("initialized", function(e, jiraBackingObject) {
  AJS.$(e.target).data('jiraBackingObject', jiraBackingObject);
});

//Setup event listener so awesomizer runs when dialogs open/chang (works with issue type switches too!)
JIRA.bind(JIRA.Events.NEW_CONTENT_ADDED, function(event,content,q) {
  let parentId = AJS.$(content).parent().attr('id');
  if ('create-issue-dialog' === parentId || 'create-subtask-dialog' === parentId) {
    main();
  }
});

function main() {
  let defaults = fetchStoredAwesomeDefaults();
  createTrulyAwesomeDefaults(defaults)
    .then(applyAwesomeDefaults);
}

function createTrulyAwesomeDefaults(defaultsMap) {
  //setup promise which waits for the "Summary" element to be visible before trying to apply, so JIRA triggers all cascade properly
  let promise = waitForCondition(function() { return AJS.$('#summary').is(":visible :enabled");});
  
  let awesomeDefaults = [];
  //find all labels on page
  for (let label of document.querySelectorAll('.jira-dialog-content label')) {
    //skip excluded fields like "summary"
    let labelKey = label.textContent.replace(/Required$/,'');
    if (excludedFields.indexOf(labelKey) > -1) {
      continue;
    }
    let a = new AwesomeDefault(labelKey, '', '');
    //load up possibly stored defaults for this one
    let storedValue = defaultsMap.get(labelKey);
    if (storedValue) {
      GM_log("Creating preloaded AwesomeDefault for " + labelKey + " with desired value " + storedValue.text);
      a = new AwesomeDefault(labelKey, storedValue.text, storedValue.value);
    }
    a.labelNode = label;
    a.valueNode = document.querySelector('#' + label.getAttribute("for"));
    if (!a.valueNode) {
      GM_log('Warning: Label [' + label + '] points to inputField id [' + label.getAttribute("for") + '] but this field doesnt exist....skipping field.');
      continue;
    }
    //This will branch off original promise, so they all run in parallel once summary is visible.
    //Do NOT need to run them serially by doing promise = promise.then() because findPossibleTextBox does not have any async operations.
    //See https://stackoverflow.com/questions/29853578/understanding-javascript-promises-stacks-and-chaining
    promise = promise.then(function() {
      a.textNode = findPossibleTextBox(a.valueNode.id) || a.valueNode;
    });
    awesomeDefaults.push(a);
  }
  return promise.then(function() {
    return awesomeDefaults;
  });
}

function applyAwesomeDefaults(awesomeDefaults) {
  let i = 0;
  for (let a of awesomeDefaults) {
    setField(a).then(function (valueSet) {
      if (valueSet) {
        successActions(a, i++);
      }
      addSaveButton(a);
    });
    
  }
}

function setField(awesomeDefault) {
  let p = Promise.resolve();
  if (!awesomeDefault.text || !AJS.$(awesomeDefault.textNode).is(":visible")) { //do nothing on empty or invisible values
    return p;
  }
  if (isEqual(awesomeDefault.value, awesomeDefault.getVal())) { //also do nothing if value's already set, useful when switching between story, bug, task, etc
    return p.then(function() {return awesomeDefault.value;});
  }
  let jiraObject = AJS.$(awesomeDefault.valueNode).data("jiraBackingObject");
  if (!jiraObject) {  //simple fields where we can just set the display text and backing object
    awesomeDefault.textNode.value = awesomeDefault.text;
    AJS.$(awesomeDefault.valueNode).val(awesomeDefault.value);
  } else {  //fanciness for AJAX selections like "Sprint", "Assignee", "Fix Versions", etc
    if (Array.isArray(awesomeDefault.text)) {
      awesomeDefault.text.forEach(function(desiredText, i) {
        p = setItemFromSuggestions(jiraObject, desiredText, awesomeDefault.value[i], awesomeDefault);
      });
    } else {
      p = setItemFromSuggestions(jiraObject, awesomeDefault.text, awesomeDefault.value, awesomeDefault);
    }
  }
  return p.then(function(descriptorWeFound) {
    return awesomeDefault.getVal();
  });
}

function setItemFromSuggestions(jiraObject, text, value, a) {
  //unwrap any array structures jQuery val() might have wrapped since this is dealing with single values
  if (Array.isArray(text)) {
    text = text[0];
  }
  if (Array.isArray(value)) {
    value = value[0];
  }
  //turn on 'aus-ss-edit' mode, which AJAX queries check before executing REST stuff
  jiraObject.$container.addClass("aui-ss-editing");
  jiraObject.$field.val(text); //set text value to limit suggestions
  return Promise.resolve(jiraObject.requestSuggestions())  //converts jQuery deferred to ES6 promise
    .then(function(suggestions){
      jiraObject.$container.removeClass("aui-ss-editing");
      jiraObject.$field.val(''); //clear text value since no longer needed for suggestions
      //Epic Link seems to put it at the end of array, so search backwards through the suggestions[] instead until we find value match
      for (let i=suggestions.length-1; i >= 0; i--) {
        for (let j=0; j < suggestions[i].properties.items.length; j++) {
          let item = suggestions[i].properties.items[j];
          if (item.properties.value === value) {
            //single-select
            if (jiraObject.setSelection) {
              jiraObject.setSelection(item);
            } else { //multi-select
              jiraObject.addItem(item);
            }
            return item;
          }
        }
      }
    });
}

function waitForCondition(f) {
  return new Promise(function (resolve, reject) {
    let checkExist = setInterval(function () {
      if (f()) {
        clearInterval(checkExist);
        resolve();
      }
    }, 20);
  });
}

function addPrintButton(a, prevElement) {
  let printButton = document.createElement('button');
  let icon = document.createElement('i');
  icon.className = 'fa fa-print fa-lg';
  printButton.appendChild(icon);
  printButton.onclick = function(event) {
    event.preventDefault();
    let saveMap = fetchStoredAwesomeDefaults();
    alert ('Saved awesomeness:\n' + JSON.stringify(saveMap));
  };
  AJS.$(printButton).insertBefore(prevElement);
  return printButton;
}

function addNukeButton(a) {
  let div = document.createElement('div');
  div.style = 'position:absolute; top:5px; right: 5px;';
  let button = document.createElement('button');
  div.appendChild(button);
  button.appendChild(createNukeIcon());
  button.onclick = function(event) {
    event.preventDefault();
    if (confirm("This will delete all your saved awesomeness, are you sure?") === true) {
      clearStorage();
      let spanMessage = document.createElement('span');
      spanMessage.innerHTML = 'Deleted! Refresh page to see.';
      div.appendChild(spanMessage);
    }
  };
  a.getContainer().style.position = 'relative'; //have to make container relative or button wont float
  a.getContainer().appendChild(div);
  return button;
}

//stringify since works with arrays too
function isEqual(a, b) {
  return (JSON.stringify(a) === JSON.stringify(b));
}

function addSaveButton(a) {
  let saveButton = document.createElement('button');
  //determine if it's a green locked icon or unlocked icon
  let icon = null;
  if (a.value && isEqual(a.value, a.getVal())) {
    icon = createSavedIcon();
  } else {
    icon = createUnsavedIcon();
  }
  saveButton.appendChild(icon);
  
  let changeFunction = function(e) {
    setTimeout(function() {
      if (!a.value) {  //if nothing saved to begin with, dont bother
        return;
      }
      if (!isEqual(a.value, a.getVal())) {
        GM_log("Houston, we have a CHANGE from the original! Orig [" + a.value + "] and new [" + a.getVal() + "]");
        a.saveButton.innerHTML = '';
        a.saveButton.appendChild(createUnsavedIcon());
        a.getContainer().style.backgroundColor = '#D3D3D3'; //light gray to indicate changed but unsaved
      } else {
        a.saveButton.innerHTML = '';
        a.saveButton.appendChild(createSavedIcon());
        a.getContainer().style.backgroundColor = '#98ff98'; //minty green
      }
    }, 20);
  };
  
  //gray out box when value changes to indicate unsaved changes
  AJS.$(a.textNode).bind('change', changeFunction);
  AJS.$(a.valueNode).bind('selected unselect', changeFunction); //for multi-selects
  
  saveButton.onclick = function (event) {
    event.preventDefault();
    if (AJS.$(a.saveButton.firstChild).hasClass('fa-lock')) {
      deleteAwesomeDefault(a);
    } else if (AJS.$(a.saveButton.firstChild).hasClass('fa-unlock-alt')) {
      saveAwesomeDefault(a);
    }
    
  };
  //visual fix for the longer fields so it inserts after parent rather than input node directly
  if ( (AJS.$(a.textNode).hasClass('text') && AJS.$(a.textNode).parent().hasClass('long-field')) || (a.label === 'Priority')) {
    AJS.$(a.textNode).parent().after("&nbsp;", saveButton);
  } else {
    AJS.$(a.textNode).nextUntil('div').andSelf().last().after("&nbsp;", saveButton);
  }
  a.saveButton = saveButton;
  return saveButton;
}

function createSavedIcon() {
  let icon = document.createElement('i');
  icon.className = 'fa fa-lock fa-lg green';
  return icon;
}

function createUnsavedIcon() {
  let icon = document.createElement('i');
  icon.className = 'fa fa-unlock-alt fa-lg';
  return icon;
}

function createNukeIcon() {
  let icon = document.createElement('i');
  icon.className = 'fa fa-bomb fa-lg red';
  return icon;
}

function delay(ms) {
  return new Promise(function(resolve, reject) {
    setTimeout(function() {
      resolve();
    }, ms);
  });
}

function findPossibleTextBox(idLabelPointsTo) {
  let possibleTextBox = (document.querySelector('#' + idLabelPointsTo + '-textarea') || document.querySelector('#' + idLabelPointsTo + '-field'));
  if (!possibleTextBox) {
    return false;
  }
  return possibleTextBox;
}

function successActions(a, i) {
  if (i === 0) {  //add nuke and print button to the first saved value
    let nukeButt = addNukeButton(a);
    addPrintButton(a, nukeButt);
  }
  a.getContainer().style.backgroundColor = '#98ff98'; //make minty green
  a.labelNode.closest('.content').appendChild(a.getContainer());  //move to end
  a.value = a.getVal();
}

function fetchStoredAwesomeDefaults() {
  let savedDefaults = GM_getValue("awesomeDefaults", "");
  if (savedDefaults) {
    return new Map(JSON.parse(savedDefaults));
  }
  return new Map();
}

function deleteAwesomeDefault(a) {
  let existingDefaultsMap = fetchStoredAwesomeDefaults();
  existingDefaultsMap.delete(a.label);
  GM_setValue("awesomeDefaults", JSON.stringify(existingDefaultsMap));
  a.saveButton.innerHTML = '';
  a.saveButton.appendChild(createUnsavedIcon());
  a.getContainer().style.backgroundColor = ''; //remove any background color
}

function saveAwesomeDefault(a) {
  if (Array.isArray(a.getText())) {
    if (a.getText().length !== a.getVal().length) {
      AJS.flag({
        type: 'error',
        title: 'Issue saving Awesome Default for ' + a.label,
        body: 'Array length mismatch between text and backing value'
      });
      return;
    }
  }
  a.text = a.getText();
  a.value = a.getVal();
  GM_log("Saving NEW default with text [" + a.text + "] and value [" + a.value + "]");
  let existingDefaultsMap = fetchStoredAwesomeDefaults();
  existingDefaultsMap.set(a.label, {
    "label": a.label,
    "text": a.getText(),
    "value": a.getVal()
  });
  GM_setValue("awesomeDefaults", JSON.stringify(existingDefaultsMap));
  a.saveButton.innerHTML = '';
  a.saveButton.appendChild(createSavedIcon());
  a.getContainer().style.backgroundColor = '#98ff98'; //make minty green
}
//global delete
function clearStorage() {
  GM_deleteValue("awesomeDefaults");
}

/* jshint ignore:start */
]]></>).toString();
var c = Babel.transform(inline_src, { presets: [ "es2015", "es2016" ] });
eval(c.code);
/* jshint ignore:end */
