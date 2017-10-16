/**
 * Copyright 2015 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
 


'use strict';

var express = require('express'); // app server
var bodyParser = require('body-parser'); // parser for post requests
var Conversation = require('watson-developer-cloud/conversation/v1'); // watson sdk
var fs = require('fs');
var formidable = require('formidable');

var ConversationPanel = require('./public/js/conversation.js');



var watson = require('watson-developer-cloud');


var visual_recognition = watson.visual_recognition({
  api_key: '295036e67588734c6a3b1c1ee8cd4cc70a571bb1',
  version: 'v3',
  version_date: '2016-05-20'
});


var app = express();

var db;

var cloudant;

var dbCredentials = {
    dbName: 'aseguradoracognitiva'
};

// Bootstrap application settings
app.use(express.static('./public')); // load UI from public folder
app.use(bodyParser.json());

// Create the service wrapper
var conversation = new Conversation({
  // If unspecified here, the CONVERSATION_USERNAME and CONVERSATION_PASSWORD env properties will be checked
  // After that, the SDK will fall back to the bluemix-provided VCAP_SERVICES environment property
  //'username': process.env.CONVERSATION_USERNAME,
  //'password': process.env.CONVERSATION_PASSWORD,
  'version_date': '2017-05-26'
});


//endpoint para hacer upload a la imagen y clasificarla con Visual Regcognition
app.post('/subirFoto', function(req, res) {
    var workspace = process.env.WORKSPACE_ID || '<workspace-id>';
  if (!workspace || workspace === '<workspace-id>') {
    return res.json({
      'output': {
        'text': 'The app has not been configured with a <b>WORKSPACE_ID</b> environment variable. Please refer to the ' + '<a href="https://github.com/watson-developer-cloud/conversation-simple">README</a> documentation on how to set this variable. <br>' + 'Once a workspace has been defined the intents may be imported from ' + '<a href="https://github.com/watson-developer-cloud/conversation-simple/blob/master/training/car_workspace.json">here</a> in order to get a working application.'
      }
    });
  }
 var form = new formidable.IncomingForm();
 var params = {
            images_file: "",
            classifier_ids: "ClasificadorSiniestro_432578065"
        };
    form.parse(req, function (err, fields, files) {
        
        var oldpath = files.filetoupload.path;
        var newpath = './public/img/'+ files.filetoupload.name;
        fs.rename(oldpath, newpath, function (err) {
            if (err) throw err;
            
        params.images_file= fs.createReadStream(newpath);
        
        visual_recognition.classify(params, function(err, resp) {
        if (err)
            console.log(err);
        else{
            console.log(JSON.stringify(resp, null, 2));
            //borramos el archivo
            fs.unlink(newpath, function(error) {
                if (error) {
                    console.log(error);
                }
                console.log('Archivo borrado');

                
            });
            
            var respuestaClasificacion="";
            
            //verificamos si la imagen cayo en una clasificacion existente
            if(resp.images[0].classifiers.length>0){
                //obtenemos la respuesta de la clasificación y dependiendo de eso se modifica el campo text de la variable entrada
                if(resp.images[0].classifiers[0].classes[0].class==='AutosConVidriosRotos'){
                    respuestaClasificacion="vidrios rotos";
                }else{
                    respuestaClasificacion="auto chocado";
                }
                
            }else{
                    respuestaClasificacion="auto sin problemas";
            }
            
                var entrada ={
                    "text":respuestaClasificacion
                }
                var payload = {
                    workspace_id: workspace,
                    context: req.body.context || {},
                    input: entrada
                };
                
                  // Send the input to the conversation service
                  conversation.message(payload, function(err, data) {
                    if (err) {
                      return res.status(err.code || 500).json(err);
                    }
                    console.log(JSON.stringify(data));
                    //updateMessage(payload, data);
                    //return data;
                    res.set('Content-Type', 'application/json');
                    return res.json(updateMessage(payload, data));
                    
                  });

            
        }
        });
                
      });
      

      
    });
    
    
});






// Endpoint to be call from the client side para conversacion
app.post('/api/message', function(req, res) {
  var workspace = process.env.WORKSPACE_ID || '<workspace-id>';
  if (!workspace || workspace === '<workspace-id>') {
    return res.json({
      'output': {
        'text': 'The app has not been configured with a <b>WORKSPACE_ID</b> environment variable. Please refer to the ' + '<a href="https://github.com/watson-developer-cloud/conversation-simple">README</a> documentation on how to set this variable. <br>' + 'Once a workspace has been defined the intents may be imported from ' + '<a href="https://github.com/watson-developer-cloud/conversation-simple/blob/master/training/car_workspace.json">here</a> in order to get a working application.'
      }
    });
  }
  var payload = {
    workspace_id: workspace,
    context: req.body.context || {},
    input: req.body.input || {}
  };

  // Send the input to the conversation service
  conversation.message(payload, function(err, data) {
    if (err) {
      return res.status(err.code || 500).json(err);
    }
    return res.json(updateMessage(payload, data));
  });
});

// Endpoint to be call from the client side para base de datos
app.get('/base/consulta', function(req, res) {
    
    console.log('Entre al get de base consulta');
  var cedula = req.query.cedula;
  var respuesta = {
        "estado":"",
        "montoAsegurado":0
  };
  
  console.log('Cedula es: '+cedula);
  
  var cloudantquery = {
        "selector": {
          "cedula": {"$eq": cedula}
        },
        "fields": ["poliza.estado","poliza.montoasegurado"]
  };
  
  
  db.find(cloudantquery, function(er, result) {
  if (er) {
    console.log(er);
    console.log("No encontre info en la base");
    res.send(respuesta);
  }
  //verificamos si no hubo respuesta de la consulta en base
  console.log("antes de Responder "+JSON.stringify(result));
  console.log("antes de Responder "+result.docs.length);
  if(result.docs.length===0){
    res.send(respuesta);
  }else{
    res.send(result.docs[0]);
  }
 
  
});


});

/**
 * Updates the response text using the intent confidence
 * @param  {Object} input The request to the Conversation service
 * @param  {Object} response The response from the Conversation service
 * @return {Object}          The response with the updated message
 */
function updateMessage(input, response) {
  var responseText = null;
  if (!response.output) {
    response.output = {};
  } else {
    return response;
  }
  if (response.intents && response.intents[0]) {
    var intent = response.intents[0];
    // Depending on the confidence of the response the app can return different messages.
    // The confidence will vary depending on how well the system is trained. The service will always try to assign
    // a class/intent to the input. If the confidence is low, then it suggests the service is unsure of the
    // user's intent . In these cases it is usually best to return a disambiguation message
    // ('I did not understand your intent, please rephrase your question', etc..)
    if (intent.confidence >= 0.75) {
      responseText = 'I understood your intent was ' + intent.intent;
    } else if (intent.confidence >= 0.5) {
      responseText = 'I think your intent was ' + intent.intent;
    } else {
      responseText = 'I did not understand your intent';
    }
  }
  response.output.text = responseText;
  return response;
}

function getDBCredentialsUrl(jsonData) {
    var vcapServices = JSON.parse(jsonData);
    // Pattern match to find the first instance of a Cloudant service in
    // VCAP_SERVICES. If you know your service key, you can access the
    // service credentials directly by using the vcapServices object.
    return vcapServices.url;
}

var cloudant_url ="";

var services = JSON.parse(process.env.VCAP_SERVICES || "{}");

function initDBConnection() {
    //When running on Bluemix, this variable will be set to a json object
    //containing all the service credentials of all the bound services
    if(process.env.VCAP_SERVICES)
			{
				services = JSON.parse(process.env.VCAP_SERVICES);
				if(services.cloudantNoSQLDB) //Check if cloudantNoSQLDB service is bound to your project
				{
					cloudant_url = services.cloudantNoSQLDB[0].credentials.url;  //Get URL and other paramters
					console.log("Name = " + services.cloudantNoSQLDB[0].name);
					console.log("URL = " + services.cloudantNoSQLDB[0].credentials.url);
    				console.log("username = " + services.cloudantNoSQLDB[0].credentials.username);
					console.log("password = " + services.cloudantNoSQLDB[0].credentials.password);
					dbCredentials.url = services.cloudantNoSQLDB[0].credentials.url;
				}
			} else { //When running locally, the VCAP_SERVICES will not be set

        // When running this app locally you can get your Cloudant credentials
        // from Bluemix (VCAP_SERVICES in "cf env" output or the Environment
        // Variables section for an app in the Bluemix console dashboard).
        // Once you have the credentials, paste them into a file called vcap-local.json.
        // Alternately you could point to a local database here instead of a
        // Bluemix service.
        // url will be in this format: https://username:password@xxxxxxxxx-bluemix.cloudant.com
        dbCredentials.url = getDBCredentialsUrl(fs.readFileSync("vcap-local.json", "utf-8"));
        //console.log('Corriendo con una base de datos local');
    }

    cloudant = require('cloudant')(dbCredentials.url);

    // check if DB exists if not create
    //cloudant.db.create(dbCredentials.dbName, function(err, res) {
    //    if (err) {
    //        console.log('Could not create new db: ' + dbCredentials.dbName + ', it might already exist.');
    //    }
    //});

    db = cloudant.use(dbCredentials.dbName);
}

initDBConnection();

module.exports = app;
