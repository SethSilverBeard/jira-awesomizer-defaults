// ==UserScript==
// @name         Jira Awesomizer Defaults
// @namespace    https://github.com/SethSilverBeard
// @version      1.0.4
// @history      1.0.4 Fixed bug #4 where stored values serialized as empty map instead of actual values.
// @history      1.0.3 Supports latest JIRA version 8.22 (March 2022)
// @description  Automatically fills in common JIRA values and allows you to override defaults
// @author       SethSilverBeard
// @downloadURL  https://github.com/SethSilverBeard/jira-awesomizer-defaults/raw/master/jira-awesomizer-defaults.user.js
// @updateURL    https://github.com/SethSilverBeard/jira-awesomizer-defaults/raw/master/jira-awesomizer-defaults.user.js
// @require      https://use.fontawesome.com/8fca914d55.js
// @include      http://jira*.*
// @include      https://jira*.*
// @run-at       document-idle
// @grant        GM_log
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// ==/UserScript==
'use strict';
  
var EXCLUDED_FIELDS = ['Project', 'Issue Type', 'Summary', 'Create another', 'Linked Issues', 'Issue'];
var CONTENT_SELECTOR = '.jira-dialog-core-content';
GM_addStyle('.green { color:green;}');
GM_addStyle('.red { color:red;}');
GM_registerMenuCommand('Manually execute Jira Awesomizer!', main);
GM_registerMenuCommand('Delete stored values', clearStorage);

//put the Jira backing object as a "data" element on the field so can access it later.  Good for fancy fields like multi-select and single-select
AJS.$('#jira').on("initialized", function(e, jiraBackingObject) {
  AJS.$(e.target).data('jiraBackingObject', jiraBackingObject);
});

//Setup event listener so awesomizer runs when dialogs open/change (works with issue type switches too!)
JIRA.bind(JIRA.Events.NEW_CONTENT_ADDED, function(event,content,q) {
  let parentId = AJS.$(content).parent().attr('id');
  if ('create-issue-dialog' === parentId || 'create-subtask-dialog' === parentId) {
    main();
  }
});

function main() {
  let defaults = fetchStoredAwesomeDefaults();
  let awesomeDefaults = createTrulyAwesomeDefaults(defaults);
  let i = 0;
  for (let a of awesomeDefaults) {
    a.applyDefault().then(function (valueSet) {
      if (valueSet) {
        successActions(a, i++);
      }
      a.addSaveButton();
    });
    
  }
}

/**
 * Creates fully initialized AwesomeDefault objects for each field that can have a default applied.
 * 
 * If pre-existing defaults exist, will populate the AWesomeDefault "text" and "value" properties with the same.
 * 
 * @param {} defaultsMap 
 * @returns Array of fully initialized AwesomeDefault objects. 
 */
function createTrulyAwesomeDefaults(defaultsMap) {
  //setup promise which waits for the "Summary" element to be visible before trying to apply, so JIRA triggers all cascade properly
  let promise = waitForCondition(function() { return AJS.$(CONTENT_SELECTOR + ' #summary').is(":visible :enabled");});
  let awesomeDefaults = [];
  //find all labels on page
  let labelSelector = CONTENT_SELECTOR + ' label';
  let labelNodes = document.querySelectorAll(labelSelector);
  if (labelNodes.length == 0) {
      GM_log("Unable to locate any labels using document.querySelectorAll('" + labelSelector + "'). May need to update selector for newer JIRA version.");
  }
  for (let labelNode of labelNodes) {
    let a = new AwesomeDefault(labelNode, promise);
    //skip excluded fields like "summary"
    let labelKey = a.label;
    if (EXCLUDED_FIELDS.indexOf(labelKey) > -1) {
      continue;
    }
    //load up possibly stored defaults for this one
    let storedValue = defaultsMap.get(labelKey);
    if (storedValue) {
      GM_log("Creating preloaded AwesomeDefault for " + labelKey + " with desired value " + storedValue.text);
      a.text = storedValue.text;
      a.value = storedValue.value;
    }
    awesomeDefaults.push(a);
  }
  return awesomeDefaults;
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

//stringify since works with arrays too
function isEqual(a, b) {
  return (JSON.stringify(a) === JSON.stringify(b));
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

/**
 * After setting a pre-saved default value, make minty green and move to end of form so it's outta the way.
 * 
 * @param {*} a AwesomeDefault object.
 * @param {*} i index of Saved item in the form.
 */
function successActions(a, i) {
  if (i === 0) {  //add nuke and print button to the first saved value
    let nukeButt = a.addNukeButton();
    a.addPrintButton(nukeButt);
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

//global delete
function clearStorage() {
  GM_deleteValue("awesomeDefaults");
}

class AwesomeDefault {

  constructor(labelNode, isVisiblePromise) {
    this.label = labelNode.textContent.replace(/\s*Required\s*$/,'');  //Label users see, such as 'Sprint', 'Division', 'Original Estimate', etc
    this.text = '';  //Text as user sees it
    this.value = '';  //Value set which corresponds with text value above

    //DOM inputs corresponding to above, these arent ever serialized
    this.labelNode = labelNode;
    this.textNode = '';  //node corresponding to textbox
    this.valueNode = document.querySelector('#' + labelNode.getAttribute("for").split(/-textarea|-field/)[0]);
    this.saveButton = '';
    this.promise = isVisiblePromise;  //add to object so anything time dependent can use it.

    if (!this.valueNode) {
      GM_log('Warning: Label [' + this.label + '] points to inputField id [' + labelNode.getAttribute("for").split(/-textarea|-field/)[0] + '] but this field doesnt exist....skipping field.');
      return;
    }
    //This will branch off original promise, so they all run in parallel once summary is visible.
    //Do NOT need to run them serially by doing promise = promise.then() because findPossibleTextBox does not have any async operations.
    //See https://stackoverflow.com/questions/29853578/understanding-javascript-promises-stacks-and-chaining
    let self = this;
    //expose to the outside world in case anyone wants access to an AwesomeDefault
    AJS.$(this.valueNode).data('awesomeDefault', this);

    this.promise.then(function() {
      self.textNode = self.findPossibleTextBox(self.valueNode.id) || self.valueNode;
      return self;
    });
  }
      
  findPossibleTextBox(idLabelPointsTo) {
    let possibleTextBox = (document.querySelector(CONTENT_SELECTOR + ' #' + idLabelPointsTo + '-textarea') || document.querySelector(CONTENT_SELECTOR + ' #' + idLabelPointsTo + '-field'));
    if (!possibleTextBox) {
      return false;
    }
    return possibleTextBox;
  }

  getContainer() {
    //parent is different depending if you're using "All" or "Custom" under "Configure Fields" button
    if (this.labelNode.parentElement.parentElement.id === 'qf-field-' + this.labelNode.getAttribute("for")) {
      return this.labelNode.parentElement.parentElement;
    }
    return this.labelNode.parentElement;
  }

  getVal() {
    return AJS.$(this.valueNode).val();
  }

  getText() {
    //gotta do gymnastics to get the actual text for things like "Sprint 5, Sprint 6" etc
    let possibleArray = AJS.$(this.textNode).siblings(".representation").find('.value-text').map(function() { return AJS.$(this).text(); }).get();
    if (possibleArray.length) {
      return possibleArray;
    }
    return this.textNode.value;
  }

  applyDefault() {
    let p = this.promise || Promise.resolve();
    let self = this;

    return p.then(function() {
      if (!self.text || !AJS.$(self.textNode).is(":visible")) { //do nothing on empty or invisible values
        return;
      }
      if (isEqual(self.value, self.getVal())) { //also do nothing if value's already set, useful when switching between story, bug, task, etc
        return self.value;
      }
      let jiraObject = AJS.$(self.valueNode).data("jiraBackingObject");
      if (!jiraObject) {  //simple fields where we can just set the display text and backing object
        self.textNode.value = self.text;
        AJS.$(self.valueNode).val(self.value);
        return self.getVal();
      } else {  //fanciness for AJAX selections like "Sprint", "Assignee", "Fix Versions", etc
        let itemPromise = Promise.resolve();
        if (Array.isArray(self.text)) {
          self.text.forEach(function(desiredText, i) {
            itemPromise = itemPromise.then(()=>self.setItemFromSuggestions(jiraObject, desiredText, self.value[i], self));  //TODO: reassigning p to make this serial is weird, fix this.
          });
        } else {
          itemPromise = self.setItemFromSuggestions(jiraObject, self.text, self.value, self);
        }
        return itemPromise.then(()=>self.getVal());
      }
    });
  }

  setItemFromSuggestions(jiraObject, text, value, a) {
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
    return Promise.resolve(jiraObject.requestSuggestions())   //converts jQuery deferred to ES6 promise
      .then(function(suggestions){
        jiraObject.$container.removeClass("aui-ss-editing");
        jiraObject.$field.val(''); //clear text value since no longer needed for suggestions
        //Epic Link seems to put it at the end of array, so search backwards through the suggestions[] instead until we find value match
        for (let i=suggestions.length-1; i >= 0; i--) {
          if (suggestions[i].properties.items === undefined) {  //Jira 7.6.0 they put some of the inputs at top level, so no subitems
            let item = suggestions[i];
            if (item.properties.value === value) {
              return a.setItem(jiraObject, item);
            }
          } else {  //with Jira 7.2.4, everything is in subitems
            for (let j=0; j < suggestions[i].properties.items.length; j++) {
              let item = suggestions[i].properties.items[j];
              if (item.properties.value === value) {
                return a.setItem(jiraObject, item);
              }
            }
          }
        }
      });
  }

  setItem(jiraObject, item) {
    //single-select
    if (jiraObject.setSelection) {
      jiraObject.setSelection(item);
    } else { //multi-select
      jiraObject.addItem(item);
    }
    return item;
  }

  addSaveButton() {
    let a = this;
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
        a.deleteAwesomeDefault();
      } else if (AJS.$(a.saveButton.firstChild).hasClass('fa-unlock-alt')) {
        a.saveAwesomeDefault();
      }
    };
    a.saveButton = saveButton;
    this.insertSaveButtonOnPage(a);
    return saveButton;
  }

  /**
   * Inserts save button (lock/unlock icon) in the HTML.
   * 
   */
  insertSaveButtonOnPage() {
    let a = this;
    //visual fix for the longer fields so it inserts after parent rather than input node directly
    GM_log(a.label + ': ' + AJS.$(a.textNode).parent().attr("class"));
    if ( (AJS.$(a.textNode).hasClass('text') && AJS.$(a.textNode).parent().hasClass('long-field')) || (a.label === 'Priority')) {
      AJS.$(a.textNode).parent().after("&nbsp;", a.saveButton);
    } else if (AJS.$(a.textNode).hasClass('textarea')) {
      // insert after the entire textarea group so save button isnt dangling.
      AJS.$(a.textNode).parents('.field-group').first().append("&nbsp;", a.saveButton);
    } else {
      AJS.$(a.textNode).nextUntil('div').addBack().last().after("&nbsp;", a.saveButton);
    }
  }

  addPrintButton(prevElement) {
    let a = this;
    let printButton = document.createElement('button');
    let icon = document.createElement('i');
    icon.className = 'fa fa-print fa-lg';
    printButton.appendChild(icon);
    printButton.onclick = function(event) {
      event.preventDefault();
      let saveMap = fetchStoredAwesomeDefaults();
      alert ('Saved awesomeness:\n' + JsonStringifyMap(saveMap));
    };
    AJS.$(printButton).insertBefore(prevElement);
    return printButton;
  }

  addNukeButton() {
    let a = this;
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
  
  deleteAwesomeDefault() {
    let a = this;
    let existingDefaultsMap = fetchStoredAwesomeDefaults();
    existingDefaultsMap.delete(a.label);
    GM_setValue("awesomeDefaults", JsonStringifyMap(existingDefaultsMap));
    a.saveButton.innerHTML = '';
    a.saveButton.appendChild(createUnsavedIcon());
    a.getContainer().style.backgroundColor = ''; //remove any background color
  }
  
  saveAwesomeDefault() {
    let a = this;
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
    GM_setValue("awesomeDefaults", JsonStringifyMap(existingDefaultsMap));
    a.saveButton.innerHTML = '';
    a.saveButton.appendChild(createSavedIcon());
    a.getContainer().style.backgroundColor = '#98ff98'; //make minty green
  }
}

/**
 * JSON stringify map is unreliable, so convert to Array tuples first and Map is happy.
 * 
 * See https://stackoverflow.com/a/53461519.
 * 
 * @param {Map} m The map to serialize to JSON string
 */
function JsonStringifyMap(m) {
  return JSON.stringify(Array.from(m.entries()));
}