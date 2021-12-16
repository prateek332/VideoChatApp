import firebase from 'firebase/app';
import 'firebase/firestore';
import appConfig from '../app.config';

// Initialize Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(appConfig.firebaseConfig);
}
const firestore = firebase.firestore();

const servers = {
  iceServers:  [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
}

let pc = new RTCPeerConnection(servers);
let localStream = null, remoteStream = null;

function App() {
  return (
    <div>
      {Layout()}
      {setTimeout(() => Stream(), 200)}
      {setTimeout(() => Offer(), 200)}
      {setTimeout(() => Answer(), 200)}
    </div>
  )
}

function Layout() {
  return (
    <div>

      <div className="videos">
        <span>
          <h3>Local Stream</h3>
          <video id="webcamVideo" autoPlay playsInline></video>
        </span>
        <span>
          <h3>Remote Video</h3>
          <video id="remoteVideo" autoPlay playsInline></video>
        </span>            
      </div>

      <button id="webcamButton">Start Webcam</button>

      <h2>2. Create a new call</h2>
      <button id="callButton" >Create call (offer)</button>

      <h3>3. Join a Call</h3>
      <p>Answer the call from a different browser window or device</p>

      <input id="callInput" />
      <button id="answerButton">Answer</button>

      <h2>4. Hangup</h2>
      <button id="hangupButton" disabled>Hangup</button>

    </div>
  )
}


// Setup media sources
function Stream() {
  
  const callButton = document.getElementById('callButton');
  const answerButton = document.getElementById('answerButton');
  const webcamButton = document.getElementById('webcamButton');
  const webcamVideo = document.getElementById('webcamVideo');
  const remoteVideo = document.getElementById('remoteVideo');

  webcamButton.onclick = async() => {
    
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true});
    
    remoteStream = new MediaStream();

    // Push tracks from local stream to peer connection
    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream);
    });

    // Pull tracks from remote stream and add to remoteStream
    pc.ontrack = event => {
      event.streams[0].getTracks().forEach(track => {
        remoteStream.addTrack(track);
      });
    };

    webcamVideo.srcObject = localStream;
    remoteVideo.srcObject = remoteStream;

    callButton.disabled = false;
    answerButton.disabled = false;
    webcamButton.disabled = true;
  }

}

async function Offer() {
  const callButton = document.getElementById('callButton');
  const callInput = document.getElementById('callInput');
  const hangupButton = document.getElementById('hangupButton');

  callButton.onclick = async() => {
    // Reference Firestore collection
    const callDoc = firestore.collection('calls').doc();
    const offerCandidates = callDoc.collection('offerCandidates');
    const answerCandidates = callDoc.collection('answerCandidates');

    callInput.value = callDoc.id;

    // Get candidates for caller, save to db
    pc.onicecandidate = event => {
      event.candidate && offerCandidates.add(event.candidate.toJSON());
    };


    // Create offer
    const offerDescription = await pc.createOffer();
    await pc.setLocalDescription(offerDescription);

    const offer = {
      sdp: offerDescription.sdp,
      type: offerDescription.type,
    };

    await callDoc.set({ offer });


    // Listen for remote answer
    callDoc.onSnapshot((snapshot) => {
      const data = snapshot.data();
      if (!pc.currentRemoteDescription && data?.answer) {
        const answerDescription = new RTCSessionDescription(data.answer);
        pc.setRemoteDescription(answerDescription);
      }
    });

    // When answered, add candidate to peer connection
    answerCandidates.onSnapshot(snapshot => {
      snapshot.docChanges().forEach((change) => {
        if(change.type === 'added') {
          const candidate = new RTCIceCandidate(change.doc.data());
          pc.addIceCandidate(candidate);
        }
      });
    });

    hangupButton.disabled = false;
  };
}

async function Answer() {
  const answerButton = document.getElementById('answerButton');

  answerButton.onclick = async() => {
    const callId = callInput.value;
    const callDoc = firestore.collection('calls').doc(callId);
    const answerCandidates = callDoc.collection('answerCandidates');

    pc.onicecandidate = event => {
      event.candidate && answerCandidates.add(event.candidate.toJSON());
    };

    const callData = (await callDoc.get()).data();

    const offerDescription = callData.offer;
    await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

    const answerDescription = await pc.createAnswer();
    await pc.setLocalDescription(answerDescription);

    const answer = {
      type: answerDescription.type,
      sdp: answerDescription.sdp,
    };

    await callDoc.update({ answer });

    offerCandidates.onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        // console.log(change);
        if (change.type === 'added') {
          let data = change.doc.data();
          pc.addIceCandidate(new RTCIceCandidate(data));
        }
      });
    });
  }
}

export default App;