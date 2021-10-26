const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const passport = require("passport");
const flash = require("express-flash");
const session = require("express-session");
const LocalStrategy = require("passport-local").Strategy;
const india = require('./state_district.js');
const { ObjectId } = require("bson"); // for line 53
const bcrypt = require("bcrypt");


const app = express();
app.use(bodyParser.json());
const port = process.env.PORT || 80;    // For Heroku
app.use("/static", express.static("static"));

app.use(express.urlencoded({ extended: false }));
app.use(flash());
app.use(session({
    secret: "node",
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());


/* Database begins */

//Connecting to the DB
mongoose.connect("mongodb+srv://<username>:<password>@soumyamoy.d1wnb.mongodb.net/Agriculture?retryWrites=true&w=majority");

//Defining "farmer_accounts" schema
const farmerAccSchema = new mongoose.Schema({
    name: String,
    age: Number,
    mobno: String,
    gender: String,
    email: String,
    address: String,
    village: String,
    state: String,
    district: String,
    pincode: Number,
    password: String
});

//farmer_accounts is the collection name ---> "farmer_accounts" collection
const farmerAcc = mongoose.model("farmer_accounts", farmerAccSchema, "farmer_accounts");

//Defining "farmers" schema
const farmerOverallSchema = new mongoose.Schema({
    farmer_id: ObjectId, // foreign key
    state: String,
    category: String,
    crop: String,
    quantity: Number,
    sold: Boolean,
    date: Date
});

//overall "farmers" collection
const farmer = mongoose.model("farmers", farmerOverallSchema, "farmers");


// Buyer Database

//Defining "buyer_accounts" schema
const buyerAccSchema = new mongoose.Schema({
    name: String,
    email: String,
    mobno: String,
    license: String,
    address: String,
    state: String,
    district: String,
    pincode: Number,
    password: String
});

//buyer_accounts is the collection name ---> "buyer_accounts" collection
const buyerAcc = mongoose.model("buyer_accounts", buyerAccSchema, "buyer_accounts");

/* Database ends */


passport.use('farmer-local', new LocalStrategy({ usernameField: 'mobno' }, (temp, password, done) => {

    // console.log("Username: " + temp); console.log("Password: " + password);

    farmerAcc.findOne({ mobno: temp }).then(user => {

        if (!user)
            return done(null, false, { message: '0The mobile number is not registered' }); //0 for farmer

        bcrypt.compare(password, user.password, (err, res) => {
            if(res) return done(null, user);
            else return done(null, false, { message: '0Incorrect Password' }); //0 for farmer
        });

    });

}))


passport.use('buyer-local', new LocalStrategy({ usernameField: 'email' }, (temp, password, done) => {

    // console.log("Username: " + temp); console.log("Password: " + password);

    buyerAcc.findOne({ email: temp }).then((user) => {

        if (!user)
            return done(null, false, { message: '1The email is not registered' }); //1 for buyer

        bcrypt.compare(password, user.password, (err, res) => {
            if(res) return done(null, user);
            else return done(null, false, { message: '1Incorrect Password' }); //1 for buyer
        });

    });

}))

passport.serializeUser((user, done) => {
    // console.log("Serializing : " + user);
    done(null, user.id);
})

passport.deserializeUser((id, done) => {
    // console.log("Deserializing : " + id);
    farmerAcc.findById(id, function (err, user) {
        if (user != null)
            done(err, user);
        else buyerAcc.findById(id, (err, user2) => {
            done(err, user2);
        })
    });
})


app.post('/login', passport.authenticate('farmer-local', {  // checkNotAuthenticated, 
    successRedirect: '/farmer_dashboard',
    failureRedirect: '/',
    failureFlash: true
}))


app.post('/registerSuccess', (req, res) => {
    const mob = req.body.mobno;

    farmerAcc.findOne({ mobno: mob }, async (err, myobj) => {
        if (myobj != null) res.json({ status: 200, flag: false });
        else {
            const hp = await bcrypt.hash(req.body.password, 5);   // further execution stops here bcz of await
            // console.log(hp);
            req.body.password = hp;
            const farmerAccData = new farmerAcc(req.body);
            farmerAccData.save();
            res.json({ status: 200, flag: true });
        }
    });
})


app.post("/getDistrict", (req, res) => {
    // console.log(req.body);
    const state = req.body.state;
    for (let i = 0; i < india.states.length; ++i) {
        if (india.states[i].state === state)
            return res.json(india.states[i].districts);
    }
    return res.json([]);
})

app.post("/checkValidity", (req,res) => {
    for (let i = 0; i < india.states.length; ++i) 
    {
        if (india.states[i].state === req.body.state)
        {
            for(let j in india.states[i].districts)
                if(j===req.body.district)
                    return res.json({status: true});
            
            return res.json({status: false});
        }
    }
    return res.json({status: false});
})



app.post('/logout', (req, res) => {
    // console.log(req);
    req.session.destroy();
    req.logOut();
    res.redirect('/');
})


//Rendering farmer dashboard
app.get("/farmer_dashboard", checkAuthFarmerDashboard, async (req, res) => {
    try {
        let temp = await farmer.find({ farmer_id: req.user._id }, {}, { sort: { date: -1 } }, (err, resultset) => {
            res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
            res.render(__dirname + "/farmer_dashboard.ejs", { username: req.user.gender+" "+req.user.name, resultSet: resultset });
        });
    }
    catch (e) { }
})


app.get("/farmer_request", checkAuthFarmerNewRequest, (req, res) => {
    res.redirect("/");
})


// New request Success
app.post("/newRequestSuccess", async (req, res) => {

    const myobj = {
        farmer_id: req.user._id,
        state: req.user.state,
        category: req.body.category,
        crop: req.body.crop,
        quantity: req.body.quantity,
        sold: false,
        date: new Date(req.body.sysdate)
    };

    const myFarmerData = new farmer(myobj);
    myFarmerData.save();

    res.json({ status: 200 });

})


//home page
app.get('/', checkNotAuthenticated, (req, res) => {
    res.render(__dirname + "/home.ejs");
})


// New farmer registration
app.get("/farmer_reg", (req, res) => {
    res.render(__dirname + "/farmer_reg.ejs", { india: india });
})


app.post('/deleteRecord', (req, res) => {
    farmer.deleteOne({ _id: req.body.myid}, {}, (err, rs) => {});
})


app.post("/moreDetails", (req, res) => {
    farmerAcc.findOne({_id: req.body.myid}, (err, rs) => {res.json(rs);});
})


app.post("/markAsSold", (req, res) => {
    farmer.updateOne({_id: req.body.myid}, {sold: true}, (err, rs) => {});
})


// BUYER

app.get("/buyer_dashboard", checkAuthBuyerDashboard, async (req, res) => {

    farmer.find({}, {}, {sort : {date: -1}}, (err, rs) => {
        // console.log(rs);
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.render(__dirname + "/buyer_dashboard.ejs", {name: req.user.name, resultSet: rs});
    })
})


app.get("/buyer_reg", (req, res) => {
    res.render(__dirname + "/buyer_reg.ejs", { india: india });
})


app.post("/loginBuyer", passport.authenticate('buyer-local', {
    successRedirect: '/buyer_dashboard',
    failureRedirect: '/',
    failureFlash: true
}))


app.post('/registerBuyerSuccess', (req, res) => {

    const email = req.body.email;

    buyerAcc.findOne({ email: email }, async (err, myobj) => {
        if (myobj != null) res.json({ status: 200, flag: false });
        else {
            const hp = await bcrypt.hash(req.body.password, 5);
            req.body.password = hp;
            const buyerAccData = new buyerAcc(req.body);
            buyerAccData.save();
            res.json({ status: 200, flag: true });
        }
    });
})


// Middlewares


function checkAuthBuyerDashboard(req, res, next)
{
    if(req.isAuthenticated())
    {
        buyerAcc.findOne({ _id: req.user.id }, (err, myobj) => {
            if (myobj == null) res.redirect("/"); else next();
        });
        return;
    }
    return res.redirect("/");
}

function checkAuthFarmerDashboard(req, res, next)
{
    // console.log("pappa");
    if(req.isAuthenticated())
    {
        farmerAcc.findOne({ _id: req.user.id }, (err, myobj) => {
            if (myobj == null) res.redirect("/"); else next();
        });
        return;
    }
    return res.redirect("/");
}

function checkAuthFarmerNewRequest(req, res, next) {

    if (req.isAuthenticated()) 
    {
        farmerAcc.findOne({ _id: req.user.id }, (err, myobj) => {
            if (myobj != null) res.render(__dirname + "/farmer_request.ejs"); else next();
        });
        return;
        // return res.render(__dirname + "/farmer_request.ejs");
    }
    next();
}

function checkNotAuthenticated(req, res, next) {

    if (req.isAuthenticated()) {
        let myid = req.user.id;

        farmerAcc.findOne({ _id: myid }, (err, myobj) => {
            if (myobj == null) res.redirect('/buyer_dashboard'); else res.redirect('/farmer_dashboard');
        });

        return;
    }
    next();
}

app.listen(port, () => { console.log("!!!Server started successfully!!!"); });