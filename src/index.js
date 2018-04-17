/// app.js
import DeckGL, {IconLayer, PathLayer} from 'deck.gl';
import ReactMapGL from 'react-map-gl';
import {render} from 'react-dom';
import React, {Component} from 'react';
import 'mapbox-gl/dist/mapbox-gl.css';
import './index.css';

import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';

import { Icon, Menu, Button, Sidebar, Segment, Checkbox, Loader } from 'semantic-ui-react';
import 'semantic-ui-css/semantic.min.css';

import axios from 'axios';

// Set your mapbox access token here
const MAPBOX_ACCESS_TOKEN = process.env.REACT_APP_MAPBOX_ACCESS_TOKEN;

// preset defined colors
// red, blue, green, teal, orange, pink
const COLORS = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [0, 255, 255], [255, 128, 0], [255, 0, 255]];

function Toolbar(props) {
  return (
    <Menu attached='top' inverted>
      <Button basic icon onClick={props.onClick} inverted>
        <Icon name='content' />
      </Button>
    </Menu>
  );
}


class App extends Component {

  constructor(props) {
    super(props);

    // bind functions
    this._toggleSidebar = this._toggleSidebar.bind(this);
    this._toggleRotate = this._toggleRotate.bind(this);
    this._createIconLayer = this._createIconLayer.bind(this);
    this._onViewportChange = this._onViewportChange.bind(this);
    this._resize = this._resize.bind(this);
    this._animate = this._animate.bind(this);

    // used to control fps
    this.then = new Date().getTime();

    this.TEAM_COLORS = {};
    axios.get('http://localhost:8000/getTeams').then(response => {
      // store in color map
      response.data.forEach((currTeam, i) => {
        this.TEAM_COLORS[currTeam.team_id] = COLORS[i];
      })
    });

    // get vertiport locations
    axios.get('http://localhost:8000/getVertiportLocations').then(response => {
      // create icon layer for vertiports
      var vertiportLayerData = response.data.map((currPort) => {
        return {icon: 'vertiport', size: 100, ...currPort};
      });  

      // update state
      this.setState({
        vertiportData: vertiportLayerData
      });
    });

    const defaultViewport = {
      longitude: -122.176128,
      latitude: 37.42240, 
      zoom: 16.5,
      minZoom: 15.5,
      maxZoom: 18,
      pitch: 0,
      bearing: 0,
      mapStyle: "mapbox://styles/mapbox/satellite-v9"
    };

    this.state = {
      viewport: {
        ...defaultViewport,
        width: 500,
        height: 500
      },
      rotate: false,
      sidebarOpen: false,
    };
  }

  _createIconLayer(id, data, getColor=undefined, onHover=undefined, onClick=undefined) {
    const sizeScaleFactor = Math.pow(this.state.viewport.zoom / 16.5, 10);

    // add getColor when that is determined
  	return new IconLayer({
	    id: id,
	    data: data,
	    iconAtlas: 'images/image-atlas-3.png',
	    iconMapping: {
        drone: {x: 0, y: 0, width: 276, height: 276, mask: true},
        vertiport: {x: 276, y: 0, width: 276, height: 276, mask: true},
        virtual_drone: {x: 552, y: 0, width: 276, height: 276, mask: true}
      },
      getSize: icon => icon.size * sizeScaleFactor, // scale with the zoom factor
      getPosition: icon => [icon.longitude, icon.latitude, icon.altitude],
	    fp64: true,
      getColor: getColor || (icon => icon.color || [0, 0, 0, 255]), 
      pickable: onHover || onClick,
      autoHighlight: true,
      onHover: onHover || (icon => {}),
      onClick: onClick || (icon => {}),
      updateTriggers: {
        getSize: [this.state.viewport.zoom]
      }
	  });
  }

  componentDidMount() {
    window.addEventListener('resize', this._resize);
    this._animate(); // default 60 fps
    this._resize();
  }

  componentWillUnmount() {
    if (this._animationFrame) {
      window.cancelAnimationFrame(this._animationFrame);
    }
  }

  _resize() {
    this._onViewportChange({
      width: window.innerWidth,
      height: window.innerHeight
    });
  }

  _onViewportChange(viewport) {
    this.setState({
      viewport: {...this.state.viewport, ...viewport}
    });
  }  

  _animate() {
    this._animationFrame = window.requestAnimationFrame(this._animate);

    // again, Date.now() if it's available
    var now = new Date().getTime();
    var delta = now - this.then;

    // custom fps
    var fps = 30;
    var interval = 1000 / fps;
    if (delta < interval) {
       return;
    }

    // update time
    // now - (delta % interval) is an improvement over just 
    // using then = now, which can end up lowering overall fps
    this.then = now - (delta % interval);

    // rotate if selected
    const rotateIncrement = 0.1;
    var newBearing = this.state.rotate ? (this.state.viewport.bearing + rotateIncrement) % 360 : 
      this.state.viewport.bearing;

    var requestPromise = axios.get('http://localhost:8000/getCurrentRequests');
    var dronePromise = axios.get('http://localhost:8000/getDroneInfo');

    Promise.all([requestPromise, dronePromise]).then(values => {
      var requestData = values[0].data;
      var droneData = values[1].data.map(currDrone => {
        return {icon: currDrone.is_physical ? 'drone' : 'virtual_drone', size: 75, ...currDrone};
      })

      this.setState({
        requestData: requestData,
        droneData: droneData,
        viewport: {...this.state.viewport, bearing: newBearing} 
      });          
    }).catch(e => {
      // do some error checking here
      console.log(e);
    })
  }

  _toggleSidebar() {
    this.setState({
      sidebarOpen: !this.state.sidebarOpen
    });
  }

  _toggleRotate() {
    this.setState({
      rotate: !this.state.rotate
    });    
  }

  render() {
    // create icon layer for drones
    var droneLayer = this._createIconLayer('drone-layer', this.state.droneData, drone => this.TEAM_COLORS[drone.team_id] || [0, 0, 0]);
    var vertiportLayer = this._createIconLayer('vertiport-layer', this.state.vertiportData);

    // dash to show requested paths, solid to show fulfilled?
    var requestLayer = new PathLayer({
      id: 'path-layer',
      data: this.state.requestData,
      fp64: true,
      getPath: (object, index) => [[object.from_longitude, object.from_latitude, object.from_altitude], [object.to_longitude, object.to_latitude, object.to_altitude]],
    });

		return (
      <div>
        <Toolbar onClick={this._toggleSidebar}/>
        <Sidebar.Pushable as={Segment} className="main-view">
          <Sidebar as={Menu} animation='push' width='wide' visible={this.state.sidebarOpen} icon='labeled' vertical inverted>
            <Menu.Item name='pitch-slider'>
              <Slider max={60} step={1} onChange={(pitch) => this._onViewportChange({pitch: pitch})}/>
              Pitch: {this.state.viewport.pitch}
            </Menu.Item>
            <Menu.Item name='bearing-slider'>
              <Slider max={359} step={1} value={this.state.viewport.bearing} onChange={(bearing) => this._onViewportChange({bearing: bearing})}/>
              Bearing: {Math.floor(this.state.viewport.bearing)}
            </Menu.Item> 
            <Menu.Item name='bearing-slider'>
              <Checkbox toggle checked={this.state.rotate} onChange={this._toggleRotate}/>
              <div> Rotate: {this.state.rotate ? "on" : "off"} </div>
            </Menu.Item>                     
          </Sidebar>
          <Sidebar.Pusher>
            <ReactMapGL {...this.state.viewport} mapboxApiAccessToken={MAPBOX_ACCESS_TOKEN} onViewportChange={this._onViewportChange}>
              <DeckGL {...this.state.viewport} layers={[
                vertiportLayer,
                droneLayer,
                requestLayer
              ]} />
            </ReactMapGL>
          </Sidebar.Pusher>
        </Sidebar.Pushable>
      </div>
    );
  }
}

// TO DO:
// [x] location of vertiports
// [x] location of real / virtual drones
//   [x] different icon for real virtual
//   [x] colored by team #
// [] arrows from / to vertiport 
//   expected and active trips, colored by team (black = unassigned)
// ---------------
// [] "trails" for drones
// [] panel with teams and current cumulative revenue
// [] small red dots / number of waiting at any vertiport or change color of vertiport icon
// depending on # of trips waiting to start
// [] automating camera movement


render(<App/>, document.getElementById('root'));
