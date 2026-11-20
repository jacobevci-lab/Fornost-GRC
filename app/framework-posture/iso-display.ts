// English display summaries for the bundled Turkish catalog. Stored decisions and audit snapshots keep their canonical references.
const topics:Record<string,string> = {
  '4.1':'Organizational context and relevance of climate change',
  '4.2':'Interested parties and applicable climate requirements',
  '4.3':'Scope of the information security management system',
  '4.4':'Information security management processes',
  '5.1':'Management leadership', '5.2':'Security policy', '5.3':'Roles and authority',
  '6.1.1':'Planning for risks and opportunities', '6.1.2':'Assessing information security risks',
  '6.1.3':'Risk treatment and statement of applicability', '6.2':'Measurable security objectives',
  '6.3':'Planning changes', '7.1':'Required resources', '7.2':'Staff competence',
  '7.3':'Staff awareness', '7.4':'Communication arrangements', '7.5.1':'Scope of documentation',
  '7.5.2':'Creating and updating documents', '7.5.3':'Controlling documented information',
  '8.1':'Managing operations', '8.2':'Assessing operational risks', '8.3':'Carrying out risk treatment',
  '9.1':'Measuring performance', '9.2.1':'Internal audit assessment', '9.2.2':'Internal audit programme',
  '9.3.1':'Management review', '9.3.2':'Inputs to management review', '9.3.3':'Management review outcomes',
  '10.1':'Continual improvement', '10.2':'Nonconformities and corrective action'
};

const annex:Record<string,string[]> = {
  'A.5':[
    'Information security policies','Security roles and responsibilities','Separation of duties','Management responsibilities',
    'Contact with authorities','Contact with special interest groups','Threat intelligence','Security in project management',
    'Inventory of information and associated assets','Acceptable use of assets','Return of assets','Information classification',
    'Information labelling','Transfer of information','Access control','Identity management','Authentication information','Access rights',
    'Security in supplier relationships','Security requirements in supplier agreements','ICT supply chain security',
    'Monitoring and reviewing supplier services and changes','Security when using cloud services','Preparing for security incidents',
    'Assessing security events','Responding to security incidents','Learning from incidents','Collecting evidence',
    'Security during disruption','ICT readiness for business continuity','Legal, regulatory and contractual requirements',
    'Intellectual property','Protecting records','Privacy and personal data','Independent security review',
    'Adherence to security policies and standards','Documented operating procedures'
  ],
  'A.6':[
    'Pre-employment screening','Employment terms','Security awareness and training','Disciplinary process',
    'Responsibilities after leaving or changing roles','Confidentiality agreements','Remote work','Reporting security events'
  ],
  'A.7':[
    'Physical security boundaries','Physical entry controls','Securing offices and facilities','Physical security monitoring',
    'Protection from physical and environmental threats','Working in secure areas','Clear desks and screens','Equipment placement and protection',
    'Assets used off-premises','Storage media','Supporting utilities','Cable protection','Equipment maintenance','Secure disposal or reuse of equipment'
  ],
  'A.8':[
    'End-user devices','Privileged access','Restricting access to information','Access to source code','Secure authentication',
    'Capacity management','Malware protection','Managing technical vulnerabilities','Configuration management','Deleting information',
    'Data masking','Preventing data leakage','Information backups','Redundancy of processing facilities','Logging','Monitoring activities',
    'Clock synchronization','Privileged utilities','Installing software on operational systems','Network security','Securing network services',
    'Network segregation','Web filtering','Use of cryptography','Secure development lifecycle','Application security requirements',
    'Secure architecture and engineering','Secure coding','Security testing and acceptance','Outsourced development',
    'Separation of development, test and production','Change management','Protecting test information','Protecting systems during audit tests'
  ]
};
for (const [group,titles] of Object.entries(annex))
  titles.forEach((title,i)=>{topics[group+'.'+(i+1)]=title;});

export function displayTitle(framework:string, ref:string, original:string, tr:boolean) {
  return !tr && framework==='ISO/IEC 27001:2022' ? topics[ref] ?? original : original;
}
