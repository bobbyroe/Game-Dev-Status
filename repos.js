var https = require("https");
var fs = require('fs');
let start_node = null;
let all_changesets = [];
let num_sets = 100;
const limit = 50;
let names_blacklist = ["Jordan2507", "neeravm", "erikhicks"];
let slots_master_list = [];
let start_date = "2018-01-01 00:00:00";
let repo_name = "";

let devs = [	{
		jira_name:"suzanne.ford",
		bb_names: ["cutopic", "Enfield.Suzanne", "cutopia", "Suzanne Enfield", "Enfield"]
	}, {
		jira_name: "Shaan.Amin",
		bb_names: ["shaanamin13"]
	}, {
		jira_name: "sandra.jhee",
		bb_names: ["jheesand"]
	}, {
		jira_name: "robert.leisle",
		bb_names: ["robertleisleigt"]
	}, {
		jira_name: "pickerele",
		bb_names: ["docsplendid", "emmettp", "EMMETT PICKEREL"]
	}, {
		jira_name: "bobby.roe",
		bb_names: ["Bobby Roe", "Bobby Rpe", "roer"]
	}, {
		jira_name: "shuo-wei.chang",
		bb_names: ["shuoweic"]
	}, {
		jira_name: "jason.miller",
		bb_names: ["millerja"]
	}, {
		jira_name: "richard.kutchera",
		bb_names: ["Kutchera.Richard", "kutcher"]
	}, {
		jira_name: "Gwendolyn.Hart",
		bb_names: ["Hart.Gwendolyn"]
	}, {
		jira_name: "andrew.velez",
		bb_names: ["Andrew Velez", "CheeselessPizza"]
	}, {
		jira_name: "ben.carney",
		bb_names: ["ben_carney","strux"]
	}, {
		jira_name: "bill.phillips",
		bb_names: ["BillPhillipsIGT"]
	}, {
		jira_name: "abhinav.sagar",
		bb_names: ["abhi3000"]
	}, {
		jira_name: "sotiri.karasoulos",
		bb_names: ["Sotiri"]
	}, {
		jira_name: "grantj",
		bb_names: ["JonGrantDDI"]
}];

function getSavedSlotsData() {
	return new Promise ( (resolve, reject) => {

		fs.readFile('_slots_data.json', { encoding: 'utf-8' }, (err, data) => {
		
			if (err === null) {
				let slot_list = JSON.parse(data, null, 4);

				let filtered_list = slot_list.projects.filter( (proj) => {
					return proj.repo && proj.repo !== "";
				});
				resolve(filtered_list);

			} else { 
				console.log('problem with request: ' + err);
				reject(err); 
			}
		});
	}); 
}

function getChangesetsRecursive (repo_obj, num = 50) {
	let num_calls = Math.floor(num / limit);

	if (num_calls === 0) {
		parseChangesetData(all_changesets);
	} else {
		requestChangesets(repo_obj).then( () => {
			getChangesetsRecursive(repo_obj, num - 50);
		});
	}
}

function requestChangesets (repo_obj) {

	return new Promise ( (resolve, reject) => {

		let start = (start_node != null) ? `&start=${start_node}`: '';
		let path = `/1.0/repositories/igtseattle/${repo_obj.repo}/changesets?limit=50${start}`;
		let opts = {
			headers: {
				"Authorization": "Basic cm9lcjpaYW5zaGluTUBOMA==",
				"Content-Type": "application/json"
			},
			host: 'api.bitbucket.org',
			path: path,
			method: 'GET'
		};

		https.request(opts, (res) => {

			let response_data = "";
			res.setEncoding('utf8');
			res.on('data', (chunk) => {
				response_data += chunk;
			}).on('end', () => {

				let parsed = JSON.parse(response_data, null, 4);
				let start_set;
				let total_num_sets = all_changesets.length + parsed.changesets.length + Math.floor(num_sets / limit)

				if (total_num_sets < num_sets) {
					// pull out the 1st entry
					start_set = parsed.changesets.shift();
					// grab the oldest changeset hash
					start_node = start_set.raw_node;
				} 			
				
				// only include changesets after start date to
				// filter out commits to Slot Template
				parsed.changesets.forEach( (s) => {
					if (new Date(s.timestamp) > new Date(start_date)) {
						all_changesets.push(s);
					}
				});
				
				resolve(); 
			});
		}).on('error', (e) => {
			console.log('problem with request: ' + e.message);
		}).end();
	});
}

function parseChangesetData (sets) {
	let dev_changesets = [];
	let message_list = [];
	sets.forEach( (commit) => {
		
		commit.author = fixName(commit.author);

		let new_branch = {};
		let is_merge = /merge/i.test(commit.message);
		let is_dupe = message_list.indexOf(commit.message) !== -1;

		// find the existing branch entry ...
		let game_dev = dev_changesets.find( (b) => {
			return b.name === commit.author;
		});

		// if none exists, create one
		if (game_dev == null && names_blacklist.includes(commit.author) === false) {
			new_dev = {
				name: commit.author,
				commits: [{ 
					message: commit.message,
					timestamp: commit.timestamp,
					branch: commit.branch
				}]
			};
			dev_changesets.push(new_dev);
		} else {

			if (is_merge === false && names_blacklist.includes(commit.author) === false && is_dupe === false) {
				// console.log(commit.author, ": ", commit);
				// console.log("\n --------------");

				message_list.push(commit.message);
				game_dev.commits.push({
					message: commit.message,
					timestamp: commit.timestamp,
					branch: commit.branch
				});
			}
		}
	});
	// console.log(message_list);

	function fixName (n) {

		let proper_name = n;
		let len = devs.length;
		let d;
		for (var i = 0; i < len; i++) {
			d = devs[i];
			if (d.bb_names.includes(n)) {
				proper_name = d.jira_name;
				break;
			}
		}

		return proper_name;
	}

	function getCommitsByDay (commits) {
		let data_by_day = [];
		commits.forEach( (commit) => {

			// HERE
			// let date = new Date(commit.timestamp).getDate();
			let new_day = {};

			let date_string = _getDateFrom(commit.timestamp);

			// find the existing branch entry ...
			let dev_day = data_by_day.find( (d) => {
				return d.date_string === date_string;
			});

			if (dev_day == null) {
				new_day = {
					date_string: date_string,
					// date: date,
					num_commits: 1,
					branch: commit.branch
				}
				data_by_day.push(new_day);
			} else {
				dev_day.num_commits += 1;
			}
		});
		return data_by_day;
	}

	// reformat developer commits 
	// to organize them by DAY 
	dev_changesets.forEach( (d) => {
		d.days = getCommitsByDay(d.commits);
	});
	
	dev_changesets.sort( (a, b) => {
		let val = 0;
		if (a.commits.length < b.commits.length) { val = 1; }
		if (a.commits.length > b.commits.length) { val = -1; }
		return val;
	});
	dev_changesets.forEach( (d) => {
		d.name = fixName(d.name);
	});

	render(dev_changesets);

	// reset / continue
	if (slind < slots_master_list.length - 1) {
		slind ++;
		start_node = null;
		all_changesets = [];
		repo_name = slots_master_list[slind].repo;
		num_sets = (repo_name !== "slot-jackpot7sfreegames") ? 100 : 100;
		start_date = slots_master_list[slind].start_date + " 00:00:00";

		getChangesetsRecursive(slots_master_list[slind], num_sets);
	} else {
		console.log("☠️");
	}
}

// helper method
function _getDateFrom (timestamp) {

	let day = ["U","M","T","W","H","F","S"];
	let hour_offset = 9 + 7; // calling new Date() adds 7 hours to the timestamp(?!)
	let adjusted_date = new Date(timestamp);
	adjusted_date.setHours(adjusted_date.getHours() - hour_offset);

	let date_string = adjusted_date.toISOString().substring(5,10).replace("-",".");
	date_string += day[adjusted_date.getDay()];

	return date_string;
}

function render (parsed_sets) {
	
	// process commits data 
	let all_dates_array = [];
	parsed_sets.forEach( (d) => {
		d.commits.forEach( (c) => {
			let date_string = _getDateFrom(c.timestamp);

			if (all_dates_array.includes(date_string) === false) {
				all_dates_array.push(date_string);
			}
		});
	});

	all_dates_array.sort((a, b) => {
		let val = 0;
		if (a < b) { val = -1; }
		if (a > b) { val = 1; }
		return val;
	});

	// // // render
	const bg_col = '\033[38;5;0;48;5;'; // 231 = white
	const col_end = '\033[m';
	const YEL = "\033[0;33m";

	let all_dates_string = "";
	let all_months_string = "";
	all_dates_array.forEach( (d) => { 
		let msp = d.includes("M") ? "| " : "";
		let fsp = d.includes("F") ? " |" : "";
		all_dates_string += `${msp} ${d.substring(3,5)}${fsp}`; 
		let month_numeral = all_months_string.includes(d.substring(0,2)) ? "  " : d.substring(0,2);
		all_months_string += `${msp} ${month_numeral}${fsp}`; 
	});

	console.log("––––––––––––––––––––––––-\n");
	console.log(`${slots_master_list[slind].status_string}`);
	console.log(`\t\t\t ${all_months_string}`);
	console.log(`\t\t\t ${all_dates_string}`);
	parsed_sets.forEach( (developer) => {

		let commits_string = "";
		all_dates_array.forEach( (date) => { 
			var this_dev_day = developer.days.filter ( (dev_day) => { 
				return dev_day.date_string === date;
			})[0];
			let num_commits = (this_dev_day != null) ? this_dev_day.num_commits : 0;
			let sp = num_commits > 9 ? "" : " ";
			let col_string = (num_commits > 0) ? `${bg_col}${15 + (num_commits * 6)}m` : "";
			let monday_space = date.includes("M") ? "| " : "";
			let friday_space = date.includes("F") ? " |" : "";

			commits_string += `${monday_space}${col_string} ${num_commits}${sp}${col_end}${friday_space}`; 
		});

		let developer_name = developer.name; // .replace(/feature-/g, '');
		let TAB = (developer_name.length < 7) ? "\t\t\t" : (developer_name.length > 14) ? "\t" : "\t\t";
		if (slots_master_list[slind].devs.includes(developer_name)) {
			developer_name = YEL + developer_name + col_end;
		}
		console.log(`${developer_name}:${TAB} ${commits_string}`);
	});
}

// GO!
let args = process.argv;
num_sets = args[2] != null ? ~~args[2] : num_sets;
let slind = 0;

getSavedSlotsData().then( (slots_data) => {

	slots_master_list = slots_data;

	// find the index of the 1st not-yet-deployed slot
	for (var i = 0, len = slots_master_list.length; i < len; i++) {
		slind = i;
		if (slots_master_list[i].is_deployed !== "true") { break; }
	}
	getChangesetsRecursive(slots_master_list[slind], num_sets);

});





