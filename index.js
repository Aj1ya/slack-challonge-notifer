const { Console } = require('console');
const fs = require('fs');
const { send } = require('process');
const readline = require('readline');

const dataFile = 'data.json';

function getSavedData() {
  if (fs.existsSync(dataFile)) {
    const data = fs.readFileSync(dataFile, 'utf8');
    return JSON.parse(data);
  }
  return null;
}

function saveData(data) {
  fs.writeFileSync(dataFile, JSON.stringify(data), 'utf8');
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function challongeInputs(){
  rl.question('Enter your Slack URL: ', (slackUrl) => {
    rl.question('Enter your Challonge Username: ', (username) => {
      rl.question('Enter your Challonge API Key: ', (apikey) => {
        rl.question('Enter your Challonge Tournament ID: ', (tournamentid) => {
          const newData = {
            slackUrl: slackUrl,
            username: username,
            apikey: apikey,
            tournamentid: tournamentid
          };
          if (newData.slackUrl && newData.username && newData.apikey && newData.tournamentid) {
            if ((newData.slackUrl ?? null !== null) &&
              (newData.username ?? null !== null) &&
              (newData.apikey ?? null !== null) &&
              (newData.tournamentid ?? null !== null)) {
            // properties are not null
            saveData(newData);
            challongeEvent();
          } else {
            // properties are null
            console.log('All data is required');
            challongeInputs();
          }
          } else {
            console.log('You will need to enter all the data required.');
            challongeInputs();
          }
        });
      });
    });
  });
}

const savedData = getSavedData();
if (savedData) {
  console.log(`Your Slack URL is ${savedData.slackUrl}`);
  console.log(`Your Challonge Username is ${savedData.username}`);
  console.log(`Your Challonge API Key is ${savedData.apikey}`);
  console.log(`Your Challonge Tournament ID is ${savedData.tournamentid}`);

  rl.question('Do you want to update the data? (yes/no): ', (answer) => {
    if (answer.toLowerCase() === 'yes') {
      challongeInputs();
    } else {
      while(!(savedData.slackUrl && savedData.username && savedData.apikey && savedData.tournamentid)){
        console.log('you will need to enter all the data required');
        challongeInputs();
        return;
      }
      challongeEvent();
    }
  });
} else {
  challongeInputs();
}

function listenForChallongeEvents() {
  const { slackUrl, username, apikey, tournamentid } = getSavedData();
  const challongeUrl= 'https://'+username+':'+apikey+'@api.challonge.com/v1/tournaments/'+tournamentid;

  const init = require('./utils/init');
  const cli = require('./utils/cli');
  const log = require('./utils/log');
  const axios = require('axios');
  const fetch = require('node-fetch');

  const input = cli.input;
  const flags = cli.flags;
  const { clear, debug } = flags;

  (async () => {
    init({ clear });
    input.includes(`help`) && cli.showHelp(0);

    debug && log(flags);

    if(input.includes('report')){

      // gets the participants of the tournament
      const participants_data = await axios.get( challongeUrl + '/participants.json' );

      // get the matches of the tournament
      const matches_data = await axios.get( challongeUrl + '/matches.json' );

      // Assuming participants_data is populated with relevant data
      const players = {};

      participants_data.data.forEach((participant, index) => {
        if (index >= 0) {
          players[participant.participant.group_player_ids[0]] = participant.participant.name;
        }
      });

      saveMatches(matches_data);

      // saves the matches to a json file only if it doesn't exist previously
      function saveMatches(matches) {
        try {
          fs.access('stored-matches.json', fs.constants.F_OK, (err) => {
            if (err) {
              fs.writeFileSync('stored-matches.json', JSON.stringify(matches.data), 'utf8');
              return;
            }
          });
        } catch (error) {
          console.error('Error occurred while saving data:', error);
        }
      }

      // Function to load previously stored matches
      function loadStoredMatches() {
        try {
          const storedMatches = fs.readFileSync('stored-matches.json', 'utf8');
          return JSON.parse(storedMatches);
        } catch (error) {
          return [];
        }
      }

      // Get the latest matches from the API
      // const matchesResponse = matches_data.data;
      const latestMatches = matches_data.data;

      // Load previously stored matches
      const storedMatches = loadStoredMatches();

      // Compare the stored matches with the latest matches
      const newMatches = latestMatches.filter((match) => {
        matchCheck(match, storedMatches)
        function matchCheck(){
          storedMatches.forEach(storedmatch => {
            if (storedmatch.match.id === match.match.id){
              if(storedmatch.match.scores_csv !== match.match.scores_csv) {
                sendSlackMessage(match.match.winner_id, match.match.loser_id, match.match.scores_csv);
                // update the stored match score for the game within the stored-matches.json file
                storedmatch.match.scores_csv = match.match.scores_csv;
                fs.writeFileSync('stored-matches.json', JSON.stringify(storedMatches), 'utf8');
              }
            }
          });
        }
      });

      function sendSlackMessage(){
        const winner_id = arguments[0];
        const winner_name = players[winner_id];
        const loser_id = arguments[1];
        const loser_name = players[loser_id];
        const score = arguments[2];

        const emoji = '\u{1F44D}';
        const message = {
          "attachments": [
              {
                text: "New Match Recorded! (" + winner_name + " vs " + loser_name + ")",
              },
              {
                  text: winner_name + " has won the game!" + emoji
              },{
                  text: "Score: " + score
              }
          ]
        };
        console.log(message);
        // fetch(slackUrl, {
        //     method: 'POST',
        //     headers: {
        //     'Content-Type': 'application/json'
        //     },
        //     body: JSON.stringify(message)
        // })
        // .then(response => console.log(response))
        // .catch(error => console.error(error));

      }
    }
  })();
}

function challongeEvent(){
  setInterval(listenForChallongeEvents, 5000);
}
