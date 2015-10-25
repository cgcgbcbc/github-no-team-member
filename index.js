#!/usr/bin/env node
function printUsage() {
  console.log('usage: ./index.js [org]');
}

if (process.argv.length !== 3) {
  printUsage();
  process.exit(-1);
}

var org = process.argv[2];

var GitHubApi = require('github');
var Config = require('nodegit').Config;
var Rx = require('rx');

var github = new GitHubApi({
  version: '3.0.0'
});

Rx.Observable.fromPromise(Config.openDefault()).flatMap(function(config) {
  return Rx.Observable.zip(
    Rx.Observable.fromPromise(config.getStringBuf('github.user')),
    Rx.Observable.fromPromise(config.getStringBuf('github.token')),
    function (user, token) {
      return {username: user, password: token};
    }
  );
}).flatMap(function(auth) {
  if (auth.username === '' || auth.password === '') {
    return Rx.Observable.throw(new Error('github.user and github.token must be set.'));
  }
  github.authenticate({
    type: 'basic',
    username: auth.username,
    password: auth.password
  });
  return Rx.Observable.zip(
    Rx.Observable.fromNodeCallback(github.orgs.getMembers)({org: org, per_page: 100}),
    Rx.Observable.fromNodeCallback(github.orgs.getTeams)({org: org}),
    function(members, teams) {
      return {members: members, teams: teams};
    }
  );
}).flatMap(function(org) {
  return Rx.Observable.zip(
    Rx.Observable.fromArray(org.teams).flatMap(function(team) {
      return Rx.Observable.fromNodeCallback(github.orgs.getTeamMembers)({id: team.id});
    }).flatMap(function(teamMembers) {
      return Rx.Observable.fromArray(teamMembers);
    }).map(function(teamMember) {
      return teamMember.login;
    }).toArray(),
    Rx.Observable.just(org.members),
    function(teamMembers, allMembers) {
      return {filter: teamMembers, all: allMembers};
    }
  );
}).flatMap(function(data) {
  var filter = data.filter;
  return Rx.Observable.fromArray(data.all).filter(function (x) {
    return filter.indexOf(x.login) === -1;
  });
}).map(function(x) {
  return x.login;
}).subscribe(
  function (x) {
    console.log(x);
  },
  function (err) {
    console.log(err);
  },
  function () {}
);
