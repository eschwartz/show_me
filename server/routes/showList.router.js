const express = require("express");
const pool = require("../modules/pool");
const router = express.Router();
const qs = require("qs");
const axios = require("axios");
const {
  rejectUnauthenticated,
} = require("../modules/authentication-middleware");

let client_id = "9742fa1bfac34acf9ca4950379c182ba"; // Your client id
let client_secret = process.env.client_secret; // Your secret
/**
 * GET route template
 */
router.get("/", async (req, res) => {
  let queryText, queryParams;
  queryText = `SELECT * FROM "show" WHERE "user_id" = $1;`;
  queryParams = [req.user.id];

  const results = await pool.query(queryText, queryParams);

  // This is an axios request to get an authorization token from spotify.
  const authResponse = await axios({
    method: "post",
    url: "https://accounts.spotify.com/api/token",
    data: qs.stringify({
      grant_type: "client_credentials",
    }),
    headers: {
      "content-type": "application/x-www-form-urlencoded;charset=utf-8",
      Authorization: `Basic ${Buffer.from(
        `${client_id}:${client_secret}`,
        "utf8"
      ).toString("base64")}`,
    },
  });

  // Declare the accesstoken variable and get it from the auth response.
  let accessToken = authResponse.data.access_token;

  // Mapping database query to promises that when fulfilled, returns the results
  const promises = results.rows.map(async (row) => {
    const response = await axios({
      method: "GET",
      url: `https://api.spotify.com/v1/artists/${row.spotifyId}`,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    // return artistResults ( the query results and add information from Spotify API call)
    return {
      showId: row.id,
      date: row.date,
      artistName: response.data.name,
      image: response.data.images[0].url,
      genre: response.data.genres[0],
      venueId: row.songKickId,
      review: row.review,
    };
  });

  const artistResults = await Promise.all(promises);
  console.log("artistResults are", artistResults);

  // Mapping artistResults to promises and making SongKick API call to add venue info

  const venuePromises = artistResults.map(async (showData) => {
    const response = await axios({
      method: "GET",
      url: `https://api.songkick.com/api/3.0/venues/${showData.venueId}.json`,
      params: {
        apikey: process.env.SONGKICK_APIKEY,
      },
    });
    /// Return all of artistResults updated with SongKick info and renamed venueResults
    return {
      showId: showData.showId,
      date: showData.date,
      artistName: showData.artistName,
      image: showData.image,
      genre: showData.genre,
      venueName: response.data.resultsPage.results.venue.displayName,
      review: showData.review,
    };
  });
  const venueResults = await Promise.all(venuePromises);
  console.log("venueResults are", venueResults);

  res.send(venueResults);
});
/**
 * POST route template
 */
router.post("/", rejectUnauthenticated, (req, res) => {
  // POST route code here
});

//PUT
router.put("/:id", rejectUnauthenticated, (req, res) => {
  console.log("/showsList PUT:", req.params.id);
  //set up query string
  const queryString = "UPDATE show SET favorite=true WHERE id=$1";
  // ask pool to run query
  pool
    .query(queryString, [req.params.id])
    .then((results) => {
      //if succesful send 200
      res.sendStatus(200);
    })
    .catch((err) => {
      console.log(err);
      //if unnsuccessful send 500;
      res.sendStatus(500);
    });
});

router.delete("/:id", rejectUnauthenticated, (req, res) => {
  pool
    .query('DELETE FROM "show" WHERE id=$1', [req.params.id])
    .then((result) => {
      res.sendStatus(200);
      console.log("The show as successfully deleted");
    })
    .catch((error) => {
      console.log("Show couldn't be deleted", error);
      res.sendStatus(500);
    });
});

module.exports = router;
