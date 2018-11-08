// https://www.npmjs.com/package/html-to-json
var htmlToJson = require("html-to-json");
var http = require("http");
var fs = require('fs');

function getEpicMapData() {

	return new Promise ( (resolve, reject) => {

		fs.readFile('epic_map.json', { encoding: 'utf-8' }, (err, data) => {
		
			if (err === null) {
				let map = JSON.parse(data, null, 4);
				resolve(map);

			} else { 
				console.log('problem with request: ' + err);
				reject(err); 
			}
		});
	}); 
}

// Go scrape Confluence for Milestone Info
function getSlotsData() {

	return new Promise ( (resolve, reject) => {

		let slot_data = {
			names: []
		};
		let opts = {
			headers: {
				"Authorization": "Basic %%hash%%",
				"Content-Type": "application/json"
			},
			host: 'confluence.doubledowninteractive.com',
			path: '/rest/api/content/46141450?expand=body.view',
			method: 'GET'
		};

		http.request(opts, (res) => {

			let response_data = "";
			res.setEncoding('utf8');
			res.on('data', (chunk) => {
				response_data += chunk;
			}).on('end', () => {



				let parsed = JSON.parse(response_data, null, 4);
				cleanSlotNameData(parsed.body.view.value);
			});
		}).on('error', (e) => {
			console.log('problem with request: ' + e.message);
		}).end();

		function cleanSlotNameData(data) {

			let cleaned = '';

			// clean up escaped chars
			cleaned = data.replace(/\\"/g, '"');
			cleaned = cleaned.replace(/\\n/g, '');

			htmlToJson.parse(cleaned, function () {

				return this.map('.relative-table td.confluenceTd:nth-child(2),th.confluenceTh:nth-child(2)', function($item) {
					
					return $item.text().replace(/\'/g, '');
				});

			}).done( (items) => {

				slot_data.names = items;
				cleanSlotReleaseDateData(cleaned);

			}, (err) => { 
				console.log('problem with cleanSlotNameData: ' + err.message);
				reject(err); 
			});
		}

		function cleanSlotReleaseDateData(data) {

			htmlToJson.parse(data, function () {

				return this.map('td.confluenceTd:last-child,th.confluenceTh:last-child', function($item) {
					
					let item = $item.text().match(/\d+\/\d+\/\d+/);
					if (item == null) {
						item = $item.text().match(/\d+\/\d+/);
					}
					return item !== null ? item[0] : $item.text();
				});
			}).done( (items) => { 

				slot_data.release_dates = items; 
				cleanSlotDeployDateData(data);

			}, (err) => { 
				console.log('problem with cleanSlotDateData: ' + err.message);
				reject(err); 
			});
		}

		function cleanSlotDeployDateData(data) {

			htmlToJson.parse(data, function () {

				return this.map('td.confluenceTd:nth-last-child(2),th.confluenceTh:nth-last-child(2)', function($item) {
					
					let item = $item.text().match(/\d+\/\d+\/\d+/);
					if (item == null) {
						item = $item.text().match(/\d+\/\d+/);
					}
					return item !== null ? item[0] : $item.text();
				});
			}).done( (items) => { 

				slot_data.deploy_dates = items; 
				cleanSlotLicenseData(data);

			}, (err) => { 
				console.log('problem with cleanSlotDateData: ' + err.message);
				reject(err); 
			});
		}

		function cleanSlotLicenseData(data) {

			htmlToJson.parse(data, function () {

				return this.map('td[class^="oc-"]:nth-child(2)', function($item) {
					
					let has_license = $item.text() !== "FALSE"
					
					return has_license;
				});
			}).done( (items) => { 

				slot_data.has_license = items; 

				resolve(slot_data);
			}, (err) => { 
				console.log('problem with cleanSlotLicenseData: ' + err.message);
				reject(err); 
			});
		}
	});
}

// Query Jira for issues
function getIssues () {

	return new Promise ( (resolve, reject) => {

		var post_data = JSON.stringify({
			"jql": "project = GCD AND issuetype = Bug AND status in " + 
				"(Open, \"In Progress\", Reopened) AND resolution = " + 
				"Unresolved ORDER BY priority DESC", // AND \"Epic Link\" = GCD-2308',
			"fields": ["status","assignee", "customfield_10200"], // customfield_10200 === Epic Link
			"maxResults": 500
		}); 

		let opts = {
			headers: {
				"Authorization": "Basic Ym9iYnkucm9lOlphbnNoaW5NQE4w",
				"Content-Type": "application/json",
				'Content-Length': Buffer.byteLength(post_data, 'utf8')
			},
			host: 'jira.doubledowninteractive.com',
			path: '/rest/api/2/search',
			method: 'POST'
		};

		let res = http.request(opts, (res) => {

			let response_data = "";
			res.setEncoding('utf8');
			res.on('data', (chunk) => {

				response_data += chunk;
			}).on('end', () => {

				resolve(JSON.parse(response_data, null, 4));
			});
		}).on('error', (err) => {
			reject(err);
		});
		res.write(post_data);
		res.end();
	});
}

// START
let one = getEpicMapData();
let two = getSlotsData();
let three = getIssues();

Promise.all([one, two, three]).then( (values) => {

	let [epic_map, slot_list, issue_data] = values;

	// console.log(epic_map.epics.length, "***", slot_list.names.length, slot_list.release_dates.length, slot_list.deploy_dates.length);
	// console.log(epic_map.epics, "***", slot_list.names, slot_list.release_dates, slot_list.deploy_dates);

	// 1 = bright / bold, 4 = underlined, 7 = negative colors.
	const RED = "\033[0;31m";
	const YEL = "\033[0;33m";
	const GRE = "\033[0;32m";
	const CYA = "\033[0;36m";
	const BLU = "\033[0;34m";
	const PUR = "\033[0;35m";
	const WHI = "\033[0;37m";
	const GRA = "\033[0;30m";
	const BRD = "\033[1;91m";
	const OFF = "\033[0m";
	const BG = "\033[0;1;46m";
	const dim = "\033[0;90m";
	let today = new Date();
	
	let export_data = { projects: [] };
	const dev_names = ["Shaan.Amin", "suzanne.ford", "Sandra.Jhee", "bobby.roe",
		"sotiri.karasoulos", "Gwendolyn.Hart", "ben.carney", 
		"richard.kutchera", "pickerele", "shuo-wei.chang", "grantj",
		"abhinav.sagar", "robert.leisle", "jason.miller", "greg.hogdal", "bill.phillips"
	];

	// append Seasonal Relaunch slots
	epic_map.epics.forEach( (epic) => {

		// filter out epics with addl. info
		if (epic.deploy_date != null && epic.launch_date) {
			
			slot_list.names.push(epic.slug);
			let n = slot_list.names.length - 1;
			slot_list.deploy_dates[n] = epic.deploy_date;
			slot_list.release_dates[n] = epic.launch_date;
		}
	});

	slot_list.names.forEach( (slot, n) => {

		let proj = epic_map.epics.filter( proj => {
			return slot.includes(proj.slug);
		})[0];
		let issues = [];
		let rdate = slot_list.release_dates[n] != null ? slot_list.release_dates[n] : '';
		let ddate = slot_list.deploy_dates[n] != null ? slot_list.deploy_dates[n] : '';
		let dtab = (ddate.length < 7) ? "\t\t" : "\t";
		let has_license = slot_list.has_license[n];

		let date_bits = ddate.split("/");
		let year = date_bits[2] && date_bits[2].length <= 2 ? `20${date_bits[2]}` : date_bits[2];
		let deployed_date = new Date(year, date_bits[0] - 1, date_bits[1]);
		let is_past = deployed_date < today;
		let active_devs = [];

		if (proj != null) {

			issues = issue_data.issues.filter ( issue => {
				let filtered = issue.fields.customfield_10200 === proj.id;
				return filtered;
			});

			issues.forEach( (issue) => {

				let name = issue.fields.assignee ? issue.fields.assignee.name : null;
				if (dev_names.indexOf(name) !== -1) {
					if (active_devs.indexOf(name) === -1) {
						active_devs.push(name);
					}
				}
			});

			let len = issues.length;
			let ncol = (len > 9) ? BRD : (len < 1) ? GRE : YEL;
			let scol = has_license === true ? YEL : CYA;

			let status_string = `${ddate}:${dtab} ${ncol}${len}${OFF},\t ${scol}${slot}${OFF} (${rdate})`;
			if (is_past === true) {
				status_string = `${dim}${ddate}:${dtab} ${len},\t ${slot} (${rdate})${OFF}`;
			}
			// console.log(status_string);

			// export
			let p = {
				id: proj.id,
				repo: proj.repo,
				slug: slot,
				devs: active_devs,
				num_open_issues: len,
				deploy_date: ddate,
				launch_date: rdate,
				status_string: status_string,
				start_date: proj.start_date,
				is_deployed: proj.is_deployed
			};
			export_data.projects.push(p);
		}
	});

	fs.writeFile('_slots_data.json', JSON.stringify(export_data, null, 4), (err) => {
		
		if (err === null) {
			console.log('The file has been saved!');
		} else { 
			console.warn('problem with request: ' + err);
		}
	});
});
