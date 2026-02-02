<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv='cache-control' content='no-cache'>
        <meta http-equiv='expires' content='0'>
        <meta http-equiv='pragma' content='no-cache'>
        <title>Club Counter</title>
        <link rel="icon" type="image/x-icon" href="https://revocentral.revofitness.com.au/portal/assets/img/favicon.ico">
        <link rel="stylesheet" type="text/css" href="https://revocentral.revofitness.com.au/portal/assets/css/bootstrap.min.css" />
        <link rel="stylesheet" type="text/css" href="https://revocentral.revofitness.com.au/portal/assets/css/style.css" />
        <script language="Javascript" src="https://revocentral.revofitness.com.au/portal/assets/js/jquery-3.7.1.js"></script>
    </head>
<body class="club-counter-background">
        <div class="content mb-5" >
        <div class="text-center my-3 mt-4 pt-2">
            <a href="https://revocentral.revofitness.com.au/portal/rewards/?closePage" class="px-10 py-2" style="color: black">
                <img src="https://revocentral.revofitness.com.au/portal/rewards/assets/img/backbutton.png" class="club-counter-back-button">
            </a>
        </div>
        <div id="clubCounter" class="container">
            <div class="row justify-content-center px-4">
                <div class="col col-md-4 ch-body">
                    <div class="live-from pt-3 text-center">
                        <img src="assets/img/Club-Counter-header.png" width="90%">
                    </div>
                </div>
            </div>
            <div class="row justify-content-center px-4">
                <div class="col col-md-4 cc-body">
                    <div id="counterSearchClub" class="row mb-3">
                        <div class="col-10 col-md-10 pl-1 select-wrapper" >
                            <input type="hidden" name="defaultCLubId" value="10" />
                            <input type="hidden" name="selectedClubId" value="10" />
                            <input
                                name="club_name"
                                type="text"
                                class="select-club"
                                id="selectedClub"
                                value="Innaloo"
                                data-member-in-club="134"
                            />
                            <button type="button" class="button-arrow-down" id="viewCLubList"><i class="arrow-down-icon"></i></button>
                        </div>
                        <div id="dropdownList" class="col-10 col-md-10 counter-club-list p-0" style="display: none">
                            <div class="blacklist p-3 mb-2"></div>
                            <ul id="clubList">
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="54"
                                            data-club-shortname="Australind"
                                            data-club-name="Australind"
                                            data-member-in-club="057"
                                        >
                                            Australind                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="33"
                                            data-club-shortname="Balcatta"
                                            data-club-name="Balcatta"
                                            data-member-in-club="074"
                                        >
                                            Balcatta                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="16"
                                            data-club-shortname="Banksia Grove"
                                            data-club-name="Banksia Grove"
                                            data-member-in-club="040"
                                        >
                                            Banksia Grove                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="15"
                                            data-club-shortname="Belmont"
                                            data-club-name="Belmont"
                                            data-member-in-club="079"
                                        >
                                            Belmont                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="80"
                                            data-club-shortname="Bunbury"
                                            data-club-name="Bunbury"
                                            data-member-in-club="066"
                                        >
                                            Bunbury                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="46"
                                            data-club-shortname="Butler"
                                            data-club-name="Butler"
                                            data-member-in-club="107"
                                        >
                                            Butler                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="14"
                                            data-club-shortname="Canning Vale"
                                            data-club-name="Canning Vale"
                                            data-member-in-club="182"
                                        >
                                            Canning Vale                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="30"
                                            data-club-shortname="Cannington"
                                            data-club-name="Cannington"
                                            data-member-in-club="147"
                                        >
                                            Cannington                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="2"
                                            data-club-shortname="Claremont"
                                            data-club-name="Claremont"
                                            data-member-in-club="122"
                                        >
                                            Claremont                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="34"
                                            data-club-shortname="Clarkson"
                                            data-club-name="Clarkson"
                                            data-member-in-club="068"
                                        >
                                            Clarkson                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="11"
                                            data-club-shortname="Cockburn"
                                            data-club-name="Cockburn"
                                            data-member-in-club="082"
                                        >
                                            Cockburn                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="41"
                                            data-club-shortname="Ellenbrook"
                                            data-club-name="Ellenbrook"
                                            data-member-in-club="140"
                                        >
                                            Ellenbrook                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="40"
                                            data-club-shortname="Girrawheen"
                                            data-club-name="Girrawheen"
                                            data-member-in-club="104"
                                        >
                                            Girrawheen                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="10"
                                            data-club-shortname="Innaloo"
                                            data-club-name="Innaloo"
                                            data-member-in-club="134"
                                        >
                                            Innaloo                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="12"
                                            data-club-shortname="Joondalup"
                                            data-club-name="Joondalup"
                                            data-member-in-club="087"
                                        >
                                            Joondalup                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="7"
                                            data-club-shortname="Kelmscott"
                                            data-club-name="Kelmscott"
                                            data-member-in-club="049"
                                        >
                                            Kelmscott                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="31"
                                            data-club-shortname="Kwinana"
                                            data-club-name="Kwinana"
                                            data-member-in-club="082"
                                        >
                                            Kwinana                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="43"
                                            data-club-shortname="Malaga"
                                            data-club-name="Malaga"
                                            data-member-in-club="187"
                                        >
                                            Malaga                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="49"
                                            data-club-shortname="Mandurah"
                                            data-club-name="Mandurah"
                                            data-member-in-club="087"
                                        >
                                            Mandurah                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="28"
                                            data-club-shortname="Midland"
                                            data-club-name="Midland"
                                            data-member-in-club="073"
                                        >
                                            Midland                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="13"
                                            data-club-shortname="Mirrabooka"
                                            data-club-name="Mirrabooka"
                                            data-member-in-club="121"
                                        >
                                            Mirrabooka                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="17"
                                            data-club-shortname="Morley"
                                            data-club-name="Morley"
                                            data-member-in-club="125"
                                        >
                                            Morley                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="27"
                                            data-club-shortname="Mount Hawthorn"
                                            data-club-name="Mount Hawthorn"
                                            data-member-in-club="099"
                                        >
                                            Mount Hawthorn                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="6"
                                            data-club-shortname="Myaree"
                                            data-club-name="Myaree"
                                            data-member-in-club="139"
                                        >
                                            Myaree                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="68"
                                            data-club-shortname="North Beach"
                                            data-club-name="North Beach"
                                            data-member-in-club="076"
                                        >
                                            North Beach                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="3"
                                            data-club-shortname="Northbridge"
                                            data-club-name="Northbridge"
                                            data-member-in-club="045"
                                        >
                                            Northbridge                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="9"
                                            data-club-shortname="O'Connor"
                                            data-club-name="O'Connor"
                                            data-member-in-club="060"
                                        >
                                            O'Connor                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="57"
                                            data-club-shortname="Rivervale"
                                            data-club-name="Rivervale"
                                            data-member-in-club="150"
                                        >
                                            Rivervale                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="44"
                                            data-club-shortname="Rockingham"
                                            data-club-name="Rockingham"
                                            data-member-in-club="129"
                                        >
                                            Rockingham                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="4"
                                            data-club-shortname="Scarborough"
                                            data-club-name="Scarborough"
                                            data-member-in-club="128"
                                        >
                                            Scarborough                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="1"
                                            data-club-shortname="Victoria Park"
                                            data-club-name="Victoria Park"
                                            data-member-in-club="083"
                                        >
                                            Victoria Park                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="51"
                                            data-club-shortname="Wanneroo"
                                            data-club-name="Wanneroo"
                                            data-member-in-club="163"
                                        >
                                            Wanneroo                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="39"
                                            data-club-shortname="Warwick"
                                            data-club-name="Warwick"
                                            data-member-in-club="086"
                                        >
                                            Warwick                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="60"
                                            data-club-shortname="Woodbridge"
                                            data-club-name="Woodbridge"
                                            data-member-in-club="050"
                                        >
                                            Woodbridge                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="81"
                                            data-club-shortname="Castle Hill"
                                            data-club-name="Castle Hill"
                                            data-member-in-club="024"
                                        >
                                            Castle Hill                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="18"
                                            data-club-shortname="Charlestown"
                                            data-club-name="Charlestown"
                                            data-member-in-club="011"
                                        >
                                            Charlestown                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="20"
                                            data-club-shortname="Pitt St"
                                            data-club-name="Pitt St"
                                            data-member-in-club="001"
                                        >
                                            Pitt St                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="22"
                                            data-club-shortname="Shellharbour"
                                            data-club-name="Shellharbour"
                                            data-member-in-club="014"
                                        >
                                            Shellharbour                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="78"
                                            data-club-shortname="Ballarat"
                                            data-club-name="Ballarat"
                                            data-member-in-club="022"
                                        >
                                            Ballarat                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="77"
                                            data-club-shortname="Braybrook"
                                            data-club-name="Braybrook"
                                            data-member-in-club="058"
                                        >
                                            Braybrook                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="73"
                                            data-club-shortname="Chadstone"
                                            data-club-name="Chadstone"
                                            data-member-in-club="011"
                                        >
                                            Chadstone                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="53"
                                            data-club-shortname="Cranbourne"
                                            data-club-name="Cranbourne"
                                            data-member-in-club="111"
                                        >
                                            Cranbourne                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="70"
                                            data-club-shortname="Epping"
                                            data-club-name="Epping"
                                            data-member-in-club="054"
                                        >
                                            Epping                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="58"
                                            data-club-shortname="Frankston"
                                            data-club-name="Frankston"
                                            data-member-in-club="061"
                                        >
                                            Frankston                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="74"
                                            data-club-shortname="Hoppers Crossing"
                                            data-club-name="Hoppers Crossing"
                                            data-member-in-club="093"
                                        >
                                            Hoppers Crossing                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="55"
                                            data-club-shortname="Knoxfield"
                                            data-club-name="Knoxfield"
                                            data-member-in-club="067"
                                        >
                                            Knoxfield                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="50"
                                            data-club-shortname="Langwarrin"
                                            data-club-name="Langwarrin"
                                            data-member-in-club="045"
                                        >
                                            Langwarrin                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="69"
                                            data-club-shortname="Maribyrnong"
                                            data-club-name="Maribyrnong"
                                            data-member-in-club="044"
                                        >
                                            Maribyrnong                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="75"
                                            data-club-shortname="Mentone"
                                            data-club-name="Mentone"
                                            data-member-in-club="006"
                                        >
                                            Mentone                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="29"
                                            data-club-shortname="Moorabbin Airport"
                                            data-club-name="Moorabbin Airport"
                                            data-member-in-club="060"
                                        >
                                            Moorabbin Airport                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="32"
                                            data-club-shortname="Narre Warren"
                                            data-club-name="Narre Warren"
                                            data-member-in-club="041"
                                        >
                                            Narre Warren                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="38"
                                            data-club-shortname="Noble Park"
                                            data-club-name="Noble Park"
                                            data-member-in-club="058"
                                        >
                                            Noble Park                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="59"
                                            data-club-shortname="Nunawading"
                                            data-club-name="Nunawading"
                                            data-member-in-club="181"
                                        >
                                            Nunawading                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="76"
                                            data-club-shortname="Nunawading OG"
                                            data-club-name="Nunawading - (Original)"
                                            data-member-in-club="002"
                                        >
                                            Nunawading - (Original)                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="42"
                                            data-club-shortname="Plenty Valley"
                                            data-club-name="Plenty Valley"
                                            data-member-in-club="057"
                                        >
                                            Plenty Valley                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="72"
                                            data-club-shortname="Richmond"
                                            data-club-name="Richmond"
                                            data-member-in-club="037"
                                        >
                                            Richmond                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="19"
                                            data-club-shortname="Southland"
                                            data-club-name="Southland"
                                            data-member-in-club="000"
                                        >
                                            Southland                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="71"
                                            data-club-shortname="Springvale"
                                            data-club-name="Springvale"
                                            data-member-in-club="090"
                                        >
                                            Springvale                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="82"
                                            data-club-shortname="Angle Vale"
                                            data-club-name="Angle Vale"
                                            data-member-in-club="000"
                                        >
                                            Angle Vale                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="21"
                                            data-club-shortname="Beverley"
                                            data-club-name="Beverley"
                                            data-member-in-club="064"
                                        >
                                            Beverley                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="36"
                                            data-club-shortname="Blair Athol"
                                            data-club-name="Blair Athol"
                                            data-member-in-club="083"
                                        >
                                            Blair Athol                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="47"
                                            data-club-shortname="Blakeview"
                                            data-club-name="Blakeview"
                                            data-member-in-club="079"
                                        >
                                            Blakeview                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="26"
                                            data-club-shortname="Glenelg"
                                            data-club-name="Glenelg"
                                            data-member-in-club="115"
                                        >
                                            Glenelg                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="37"
                                            data-club-shortname="Happy Valley"
                                            data-club-name="Happy Valley"
                                            data-member-in-club="042"
                                        >
                                            Happy Valley                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="24"
                                            data-club-shortname="Marion"
                                            data-club-name="Marion"
                                            data-member-in-club="078"
                                        >
                                            Marion                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="25"
                                            data-club-shortname="Modbury"
                                            data-club-name="Modbury"
                                            data-member-in-club="070"
                                        >
                                            Modbury                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="45"
                                            data-club-shortname="Parafield"
                                            data-club-name="Parafield"
                                            data-member-in-club="108"
                                        >
                                            Parafield                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="79"
                                            data-club-shortname="Salisbury Downs"
                                            data-club-name="Salisbury Downs"
                                            data-member-in-club="140"
                                        >
                                            Salisbury Downs                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="52"
                                            data-club-shortname="Seaford Meadows"
                                            data-club-name="Seaford Meadows"
                                            data-member-in-club="053"
                                        >
                                            Seaford Meadows                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="23"
                                            data-club-shortname="Windsor Gardens"
                                            data-club-name="Windsor Gardens"
                                            data-member-in-club="138"
                                        >
                                            Windsor Gardens                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="35"
                                            data-club-shortname="Woodcroft"
                                            data-club-name="Woodcroft"
                                            data-member-in-club="063"
                                        >
                                            Woodcroft                                        </a>
                                    </li>
                                                                    <li>
                                        <a href="javascript: void(0)" 
                                            class="club-shortname"
                                            data-club-id="48"
                                            data-club-shortname="Woodville"
                                            data-club-name="Woodville"
                                            data-member-in-club="047"
                                        >
                                            Woodville                                        </a>
                                    </li>
                                        
                            </ul>
                        </div>
                        <div class="col-2 col-md-2 p-1 d-flex justify-content-center">
                            <div class="map-pointer">
                                <div class="star-black"><div id="favoriteClub" class="star-gold"></div></div>
                            </div>
                        </div>
                    </div>
                    <div class="row number-counter">
                        <div class="center-line"></div>
                        <div class="col-4 col-md-4 number-count number-count-1 py-2">0</div>
                        <div class="col-4 col-md-4 number-count number-count-2 py-2">0</div>
                        <div class="col-4 col-md-4 number-count number-count-3 py-2">0</div>
                    </div>
                    <div class="row p-2 weeklist">
                        <div class="col-3 col-md-3 the-arrow">
                            <button type="button" class="left-arrow-button">&#8592;</button>
                        </div>
                        <div id="daysOfWeek" class="col-6 col-md-6 text-center p-0">
                            <div data-weeknumber="1"><span>Typical</span> Monday</div>
                            <div style="display: none" data-weeknumber="2">
                                    Tuesday                            </div>
                            <div style="display: none" data-weeknumber="3">
                                    Wednesday                            </div>
                            <div style="display: none" data-weeknumber="4">
                                    Thursday                            </div>
                            <div style="display: none" data-weeknumber="5">
                                    Friday                            </div>
                            <div style="display: none" data-weeknumber="6">
                                    Saturday                            </div>
                            <div style="display: none" data-weeknumber="0">
                                    Sunday                            </div>
                        </div>
                        <div class="col-3 col-md-3 the-arrow">
                            <button type="button" class="right-arrow-button">&#8594;</button>
                        </div>
                    </div>
                    <div class="row bar-graph p-2">
                        <div class="col col-md-12 bar-graph-data p-0">
                                                            <div class="bar-container">
                                    <div class="bar" 
                                        style=""
                                        data-percentage="10"
                                        data-current-hour="no";
                                    >
                                    </div>
                                    <span class="label">1</span>
                                </div>
                                                            <div class="bar-container">
                                    <div class="bar" 
                                        style=""
                                        data-percentage="20"
                                        data-current-hour="no";
                                    >
                                    </div>
                                    <span class="label">2</span>
                                </div>
                                                            <div class="bar-container">
                                    <div class="bar" 
                                        style=""
                                        data-percentage="20"
                                        data-current-hour="no";
                                    >
                                    </div>
                                    <span class="label">3</span>
                                </div>
                                                            <div class="bar-container">
                                    <div class="bar" 
                                        style=""
                                        data-percentage="20"
                                        data-current-hour="no";
                                    >
                                    </div>
                                    <span class="label">4</span>
                                </div>
                                                            <div class="bar-container">
                                    <div class="bar" 
                                        style=""
                                        data-percentage="30"
                                        data-current-hour="no";
                                    >
                                    </div>
                                    <span class="label">5</span>
                                </div>
                                                            <div class="bar-container">
                                    <div class="bar" 
                                        style=""
                                        data-percentage="100"
                                        data-current-hour="no";
                                    >
                                    </div>
                                    <span class="label">6</span>
                                </div>
                                                            <div class="bar-container">
                                    <div class="bar" 
                                        style=""
                                        data-percentage="100"
                                        data-current-hour="no";
                                    >
                                    </div>
                                    <span class="label">7</span>
                                </div>
                                                            <div class="bar-container">
                                    <div class="bar" 
                                        style=""
                                        data-percentage="100"
                                        data-current-hour="no";
                                    >
                                    </div>
                                    <span class="label">8</span>
                                </div>
                                                            <div class="bar-container">
                                    <div class="bar" 
                                        style=""
                                        data-percentage="50"
                                        data-current-hour="no";
                                    >
                                    </div>
                                    <span class="label">9</span>
                                </div>
                                                            <div class="bar-container">
                                    <div class="bar" 
                                        style=""
                                        data-percentage="50"
                                        data-current-hour="no";
                                    >
                                    </div>
                                    <span class="label">10</span>
                                </div>
                                                            <div class="bar-container">
                                    <div class="bar" 
                                        style=""
                                        data-percentage="20"
                                        data-current-hour="no";
                                    >
                                    </div>
                                    <span class="label">11</span>
                                </div>
                                                            <div class="bar-container">
                                    <div class="bar" 
                                        style=""
                                        data-percentage="10"
                                        data-current-hour="no";
                                    >
                                    </div>
                                    <span class="label">12</span>
                                </div>
                                                            <div class="bar-container">
                                    <div class="bar" 
                                        style=""
                                        data-percentage="20"
                                        data-current-hour="no";
                                    >
                                    </div>
                                    <span class="label">13</span>
                                </div>
                                                            <div class="bar-container">
                                    <div class="bar" 
                                        style=""
                                        data-percentage="20"
                                        data-current-hour="no";
                                    >
                                    </div>
                                    <span class="label">14</span>
                                </div>
                                                            <div class="bar-container">
                                    <div class="bar" 
                                        style=""
                                        data-percentage="30"
                                        data-current-hour="no";
                                    >
                                    </div>
                                    <span class="label">15</span>
                                </div>
                                                            <div class="bar-container">
                                    <div class="bar" 
                                        style=""
                                        data-percentage="30"
                                        data-current-hour="no";
                                    >
                                    </div>
                                    <span class="label">16</span>
                                </div>
                                                            <div class="bar-container">
                                    <div class="bar" 
                                        style=""
                                        data-percentage="60"
                                        data-current-hour="no";
                                    >
                                    </div>
                                    <span class="label">17</span>
                                </div>
                                                            <div class="bar-container">
                                    <div class="bar" 
                                        style=""
                                        data-percentage="60"
                                        data-current-hour="no";
                                    >
                                    </div>
                                    <span class="label">18</span>
                                </div>
                                                            <div class="bar-container">
                                    <div class="bar" 
                                        style="background-color: #ef323d"
                                        data-percentage="80"
                                        data-current-hour="yes";
                                    >
                                    </div>
                                    <span class="label">19</span>
                                </div>
                                                            <div class="bar-container">
                                    <div class="bar" 
                                        style=""
                                        data-percentage="110"
                                        data-current-hour="no";
                                    >
                                    </div>
                                    <span class="label">20</span>
                                </div>
                                                            <div class="bar-container">
                                    <div class="bar" 
                                        style=""
                                        data-percentage="60"
                                        data-current-hour="no";
                                    >
                                    </div>
                                    <span class="label">21</span>
                                </div>
                                                            <div class="bar-container">
                                    <div class="bar" 
                                        style=""
                                        data-percentage="30"
                                        data-current-hour="no";
                                    >
                                    </div>
                                    <span class="label">22</span>
                                </div>
                                                            <div class="bar-container">
                                    <div class="bar" 
                                        style=""
                                        data-percentage="20"
                                        data-current-hour="no";
                                    >
                                    </div>
                                    <span class="label">23</span>
                                </div>
                                                            <div class="bar-container">
                                    <div class="bar" 
                                        style=""
                                        data-percentage="10"
                                        data-current-hour="no";
                                    >
                                    </div>
                                    <span class="label">24</span>
                                </div>
                                                    </div>
                        <div id="statusMessage" class="col-md-12 bar-graph-text p-1 mt-1"></div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
<script>
    var clubCounterLists = {"Australind":{"shortname":"Australind","name":"Australind","id":54,"in_club":"057"},"Balcatta":{"shortname":"Balcatta","name":"Balcatta","id":33,"in_club":"074"},"Banksia Grove":{"shortname":"Banksia Grove","name":"Banksia Grove","id":16,"in_club":"040"},"Belmont":{"shortname":"Belmont","name":"Belmont","id":15,"in_club":"079"},"Bunbury":{"shortname":"Bunbury","name":"Bunbury","id":80,"in_club":"066"},"Butler":{"shortname":"Butler","name":"Butler","id":46,"in_club":"107"},"Canning Vale":{"shortname":"Canning Vale","name":"Canning Vale","id":14,"in_club":"182"},"Cannington":{"shortname":"Cannington","name":"Cannington","id":30,"in_club":"147"},"Claremont":{"shortname":"Claremont","name":"Claremont","id":2,"in_club":"122"},"Clarkson":{"shortname":"Clarkson","name":"Clarkson","id":34,"in_club":"068"},"Cockburn":{"shortname":"Cockburn","name":"Cockburn","id":11,"in_club":"082"},"Ellenbrook":{"shortname":"Ellenbrook","name":"Ellenbrook","id":41,"in_club":"140"},"Girrawheen":{"shortname":"Girrawheen","name":"Girrawheen","id":40,"in_club":"104"},"Innaloo":{"shortname":"Innaloo","name":"Innaloo","id":10,"in_club":"134"},"Joondalup":{"shortname":"Joondalup","name":"Joondalup","id":12,"in_club":"087"},"Kelmscott":{"shortname":"Kelmscott","name":"Kelmscott","id":7,"in_club":"049"},"Kwinana":{"shortname":"Kwinana","name":"Kwinana","id":31,"in_club":"082"},"Malaga":{"shortname":"Malaga","name":"Malaga","id":43,"in_club":"187"},"Mandurah":{"shortname":"Mandurah","name":"Mandurah","id":49,"in_club":"087"},"Midland":{"shortname":"Midland","name":"Midland","id":28,"in_club":"073"},"Mirrabooka":{"shortname":"Mirrabooka","name":"Mirrabooka","id":13,"in_club":"121"},"Morley":{"shortname":"Morley","name":"Morley","id":17,"in_club":"125"},"Mount Hawthorn":{"shortname":"Mount Hawthorn","name":"Mount Hawthorn","id":27,"in_club":"099"},"Myaree":{"shortname":"Myaree","name":"Myaree","id":6,"in_club":"139"},"North Beach":{"shortname":"North Beach","name":"North Beach","id":68,"in_club":"076"},"Northbridge":{"shortname":"Northbridge","name":"Northbridge","id":3,"in_club":"045"},"O'Connor":{"shortname":"O'Connor","name":"O'Connor","id":9,"in_club":"060"},"Rivervale":{"shortname":"Rivervale","name":"Rivervale","id":57,"in_club":"150"},"Rockingham":{"shortname":"Rockingham","name":"Rockingham","id":44,"in_club":"129"},"Scarborough":{"shortname":"Scarborough","name":"Scarborough","id":4,"in_club":"128"},"Victoria Park":{"shortname":"Victoria Park","name":"Victoria Park","id":1,"in_club":"083"},"Wanneroo":{"shortname":"Wanneroo","name":"Wanneroo","id":51,"in_club":"163"},"Warwick":{"shortname":"Warwick","name":"Warwick","id":39,"in_club":"086"},"Woodbridge":{"shortname":"Woodbridge","name":"Woodbridge","id":60,"in_club":"050"},"Castle Hill":{"shortname":"Castle Hill","name":"Castle Hill","id":81,"in_club":"024"},"Charlestown":{"shortname":"Charlestown","name":"Charlestown","id":18,"in_club":"011"},"Pitt St":{"shortname":"Pitt St","name":"Pitt St","id":20,"in_club":"001"},"Shellharbour":{"shortname":"Shellharbour","name":"Shellharbour","id":22,"in_club":"014"},"Ballarat":{"shortname":"Ballarat","name":"Ballarat","id":78,"in_club":"022"},"Braybrook":{"shortname":"Braybrook","name":"Braybrook","id":77,"in_club":"058"},"Chadstone":{"shortname":"Chadstone","name":"Chadstone","id":73,"in_club":"011"},"Cranbourne":{"shortname":"Cranbourne","name":"Cranbourne","id":53,"in_club":"111"},"Epping":{"shortname":"Epping","name":"Epping","id":70,"in_club":"054"},"Frankston":{"shortname":"Frankston","name":"Frankston","id":58,"in_club":"061"},"Hoppers Crossing":{"shortname":"Hoppers Crossing","name":"Hoppers Crossing","id":74,"in_club":"093"},"Knoxfield":{"shortname":"Knoxfield","name":"Knoxfield","id":55,"in_club":"067"},"Langwarrin":{"shortname":"Langwarrin","name":"Langwarrin","id":50,"in_club":"045"},"Maribyrnong":{"shortname":"Maribyrnong","name":"Maribyrnong","id":69,"in_club":"044"},"Mentone":{"shortname":"Mentone","name":"Mentone","id":75,"in_club":"006"},"Moorabbin Airport":{"shortname":"Moorabbin Airport","name":"Moorabbin Airport","id":29,"in_club":"060"},"Narre Warren":{"shortname":"Narre Warren","name":"Narre Warren","id":32,"in_club":"041"},"Noble Park":{"shortname":"Noble Park","name":"Noble Park","id":38,"in_club":"058"},"Nunawading":{"shortname":"Nunawading","name":"Nunawading","id":59,"in_club":"181"},"Nunawading OG":{"shortname":"Nunawading OG","name":"Nunawading - (Original)","id":76,"in_club":"002"},"Plenty Valley":{"shortname":"Plenty Valley","name":"Plenty Valley","id":42,"in_club":"057"},"Richmond":{"shortname":"Richmond","name":"Richmond","id":72,"in_club":"037"},"Southland":{"shortname":"Southland","name":"Southland","id":19,"in_club":"000"},"Springvale":{"shortname":"Springvale","name":"Springvale","id":71,"in_club":"090"},"Angle Vale":{"shortname":"Angle Vale","name":"Angle Vale","id":82,"in_club":"000"},"Beverley":{"shortname":"Beverley","name":"Beverley","id":21,"in_club":"064"},"Blair Athol":{"shortname":"Blair Athol","name":"Blair Athol","id":36,"in_club":"083"},"Blakeview":{"shortname":"Blakeview","name":"Blakeview","id":47,"in_club":"079"},"Glenelg":{"shortname":"Glenelg","name":"Glenelg","id":26,"in_club":"115"},"Happy Valley":{"shortname":"Happy Valley","name":"Happy Valley","id":37,"in_club":"042"},"Marion":{"shortname":"Marion","name":"Marion","id":24,"in_club":"078"},"Modbury":{"shortname":"Modbury","name":"Modbury","id":25,"in_club":"070"},"Parafield":{"shortname":"Parafield","name":"Parafield","id":45,"in_club":"108"},"Salisbury Downs":{"shortname":"Salisbury Downs","name":"Salisbury Downs","id":79,"in_club":"140"},"Seaford Meadows":{"shortname":"Seaford Meadows","name":"Seaford Meadows","id":52,"in_club":"053"},"Windsor Gardens":{"shortname":"Windsor Gardens","name":"Windsor Gardens","id":23,"in_club":"138"},"Woodcroft":{"shortname":"Woodcroft","name":"Woodcroft","id":35,"in_club":"063"},"Woodville":{"shortname":"Woodville","name":"Woodville","id":48,"in_club":"047"}};
    var barGraphData = [{"1":10,"2":20,"3":20,"4":20,"5":30,"6":100,"7":100,"8":100,"9":50,"10":50,"11":20,"12":10,"13":20,"14":20,"15":30,"16":30,"17":60,"18":60,"19":80,"20":110,"21":60,"22":30,"23":20,"24":10},{"1":10,"2":20,"3":20,"4":20,"5":30,"6":100,"7":100,"8":100,"9":50,"10":50,"11":20,"12":10,"13":20,"14":20,"15":30,"16":30,"17":60,"18":60,"19":80,"20":110,"21":60,"22":30,"23":20,"24":10},{"1":10,"2":20,"3":20,"4":20,"5":30,"6":100,"7":100,"8":100,"9":50,"10":50,"11":20,"12":10,"13":20,"14":20,"15":30,"16":30,"17":60,"18":60,"19":80,"20":110,"21":60,"22":30,"23":20,"24":10},{"1":10,"2":20,"3":20,"4":20,"5":30,"6":100,"7":100,"8":100,"9":50,"10":50,"11":20,"12":10,"13":20,"14":20,"15":30,"16":30,"17":60,"18":60,"19":80,"20":110,"21":60,"22":30,"23":20,"24":10},{"1":10,"2":20,"3":20,"4":20,"5":30,"6":100,"7":100,"8":100,"9":50,"10":50,"11":20,"12":10,"13":20,"14":20,"15":30,"16":30,"17":60,"18":60,"19":80,"20":110,"21":60,"22":30,"23":20,"24":10},{"1":10,"2":20,"3":20,"4":20,"5":30,"6":100,"7":100,"8":100,"9":50,"10":50,"11":20,"12":10,"13":20,"14":20,"15":30,"16":30,"17":60,"18":60,"19":80,"20":110,"21":60,"22":30,"23":20,"24":10},{"1":10,"2":20,"3":20,"4":20,"5":30,"6":100,"7":100,"8":100,"9":50,"10":50,"11":20,"12":10,"13":20,"14":20,"15":30,"16":30,"17":60,"18":60,"19":80,"20":110,"21":60,"22":30,"23":20,"24":10}];
    var favoriteClubId = 10;
</script>

<script type="text/javascript" src="https://revocentral.revofitness.com.au/portal/assets/js/jquery-3.7.1.js"></script>
<script type="text/javascript" src="https://revocentral.revofitness.com.au/portal/assets/js/jquery.cookie.js"></script>
<script type="text/javascript" src="https://revocentral.revofitness.com.au/portal/assets/js/script.js"></script>
</body>
</html>