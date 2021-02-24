import 'react-native-gesture-handler';
import React from 'react';
import {AppRegistry} from 'react-native';
import {name as appName} from './app.json';

let Provider;
let App;
let NotesnookShare;
let QuickNoteIOS;

const AppProvider = () => {
  Provider = require('./src/provider').Provider
  App = require("./App").default
  return (
    <Provider>
      <App />
    </Provider>
  );
};

AppRegistry.registerComponent(appName, () => AppProvider);

AppRegistry.registerComponent('NotesnookShare', () => {
  NotesnookShare = require("./NotesnookShare").default
  return NotesnookShare;
})

AppRegistry.registerComponent('QuickNoteIOS', () => {
  QuickNoteIOS = require("./QuickNoteIOS").default
  return QuickNoteIOS;
})

