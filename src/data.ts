// --- 1. TYPE DEFINITIONS ---
interface Education {
  degree: string;
  uni: string;
  dates: string;
  details?: string;
}

interface Leadership {
  role: string;
  org: string;
  note?: string;
}

interface Experience {
  title: string;
  company: string;
  dates: string;
  details: string[]; // specific items can contain HTML strings like <strong>
}

interface Project {
  title: string;
  desc: string;
  tech: string;
}

interface Interest {
  name: string;
  desc: string;
}

interface CVData {
  profile: {
    name: string;
    title: string;
    location: string;
    phone: string;
    email: string;
    website: string;
    summary?: string;
  };
  education?: Education[];
  competencies?: string[];
  interests?: Interest[];
  achievements?: Leadership[];
  skills?: Record<string, string[]>;
  experience?: Experience[];
  projects?: Project[];
}

// --- 2. DATA (Reactive) ---
export const cvData: CVData = {
  profile: {
    name: "Warren Scantlebury",
    title: "Full Stack Software Engineer",
    location: "Bridgetown, Barbados",
    phone: "+44 7591 075672",
    email: "warren.scantlebury@gmail.com",
    website: "warren.scantlebury.io",
    summary:
      "Results-oriented Software Engineer with a Master’s in Computer Science and significant experience in building scalable web applications. Expert in <strong>TypeScript (Node.js/React)</strong> and <strong>DevOps (GCP/Kubernetes)</strong>. Proven track record of architecting serverless APIs and leading frontend initiatives.",
  },
  education: [
    {
      degree: "MSc Computer Science",
      uni: "University of Nottingham",
      dates: "2021 – 2022",
      details: "Distinction.",
    },
    {
      degree: "BSc Computer Science",
      uni: "UWI Cave Hill",
      dates: "2014 – 2018",
      details: "(1:1) First Class Hons. Double Major.",
    },
  ],
  competencies: [
    "Agile & Scrum",
    "CI/CD Pipelines",
    "TDD",
    "Microservices Architecture",
    "Junior Mentorship",
  ],
  achievements: [
    {
      role: "Startup Weekend Winner",
      org: "Google for Entrepreneurs",
      note: "Awarded 'Most Innovative Idea'",
    },
    {
      role: "Submitted Acedemic Research Paper (Under Review)",
      org: "Emerging Networks and Services in Developing Nations -- Barbados Use Case",
      note: "Co-authored with Supervising Professor, Dr. Milena Radenkovic",
    },
  ],
  skills: {
    Frontend: [
      "TypeScript",
      "JavaScript",
      "React",
      "Next.js",
      "Vue.js",
      "Tailwind CSS",
    ],
    Backend: ["Node.js", "Express", "RESTful APIs", "GraphQL"],
    "DevOps & Cloud": [
      "GCP",
      "AWS Lambda",
      "Kubernetes",
      "Terraform",
      "GitOps",
      "Kafka",
      "SQL",
    ],
  },
  experience: [
    {
      title: "Software Engineering Consultant",
      company: "The RAD Consulting Group",
      dates: "Oct 2022 – Present",
      details: [
        "Architected full-stack applications using <strong>TypeScript, React (Next.js), and Node.js</strong>, serving as a core contributor.",
        "Engineered cloud infrastructure on <strong>GCP</strong> using <strong>Terraform</strong> and <strong>Helm</strong>, implementing <strong>GitOps<strong> workflows.",
        "Orchestrated containerized microservices on <strong>Kubernetes</strong>, integrating <strong>Kafka</strong> for event streaming and <strong>BigQuery</strong>.",
      ],
    },
    {
      title: "Software Engineer",
      company: "Smartterm Ltd",
      dates: "Jan 2021 – June 2021",
      details: [
        "Developed high-performance educational platforms using Agile methodologies.",
        "Built secure video conferencing features in <strong>Next.js</strong> integrating AWS Chime SDK and AWS Cognito.",
      ],
    },
    {
      title: "Software Engineer",
      company: "Smartmatic International",
      dates: "Sep 2019 – Dec 2020",
      details: [
        "<strong>Lead Frontend Developer</strong> for an Angular 9 election application, implementing complex Internationalization.",
        "Co-developed a company-wide Design System focused on Accessibility using <strong>Web Components</strong> and Vue.js.",
      ],
    },
  ],
};

export const page2Data: CVData = {
  profile: { ...cvData.profile, summary: undefined }, // Empty summary for page 2
  //   education: cvData.education,
  experience: [
    {
      title: "Web Developer",
      company: "Hyuna International",
      dates: "May 2017 – Sep 2019",
      details: [
        "Designed and deployed a critical internal RESTful API central to daily operations.",
        "Developed serverless microservices using AWS Lambda and API Gateway.",
      ],
    },
  ],
  interests: [
    {
      name: "Hardware Tinkering",
      desc: "Raspberry Pi & Arduino, Home automation, Homelab setup",
    },
    { name: "Cricket", desc: "Competitive play & Captaincy" },
    {
      name: "PWA Research",
      desc: "Coding on the bleeding edge of web tech and Pushing web capabilities",
    },
  ],
  projects: [
    {
      title: "Real-time Chat PWA",
      desc: "Engineered a PWA with real-time messaging, voice notes, and push notifications.",
      tech: "MongoDB • Socket.IO • Vue2",
    },
    {
      title: "Dominoes Multiplayer PWA",
      desc: "Developed a multiplayer game with real-time state synchronization and live chat using Firestore.",
      tech: "Firebase • React",
    },
  ],
};
