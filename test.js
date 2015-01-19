
/*
Copyright (C) 2013 Tony Mobily

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var 
  dummy

, path = require('path')
, declare = require('simpledeclare')
, SimpleSchema = require('simpleschema')
, SimpleSchemaMongo = require('simpleschema-mongo')

, TingoMixin = require('./TingoMixin.js')

, async = require('async')
, Db = require('tingodb')({ searchInArray: true } ).Db;
;


var SchemaMixin = declare( [ SimpleSchema, SimpleSchemaMongo ] );

var me = path.dirname( require.resolve( 'simpledblayer' ) );
var simpledblayerTests = require( me + "/test.js" );

//var simpledblayerTests = require( "./lib/simpledblayer/test.js" );

var tests = simpledblayerTests.get(

  function getDbInfo( done ) {
    
   // Create the directory
   try {
     require('fs').mkdirSync('/tmp/tests');
   } catch( e ){
   }

    var db = new Db('/tmp/tests', {});
    //done( null, db, SchemaMixin, TingoMixin );
    done( null, db, SimpleSchema, TingoMixin );
  },

  function closeDb( db, done ) {
    db.close( done );
  }
);


for(var test in tests) {
    exports[ test ] = tests[ test ];
}



