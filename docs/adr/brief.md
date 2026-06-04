
  what matters . * WE LITERALLY JUS START WITH BARE MINIMUM , seriously a working cached secure login form that has is secure , good ux is literally progress , a small app route/ /challenge  , a basic text editor for the coding interface that runs locally without crashing , even if we have to submit things manually for now it is progress . the goal is to incrementally improve the user experience and system design as we go , nothing crazy we . the whole complex dev stack will be apparent to us as we build it * 

hey team let me walk you through the entire vision for why we are building this the hard way because every decision we made has a specific engineering purpose to ensure we survive real world scale
1
first we have the monorepo setup with turborepo which might feel complex now but it allows us to share types between our frontend and our backend perfectly so when sanira changes a database field in the challenge service pabodha will immediately see a typescript error in the web app if they are using that field wrong this prevents bugs before they ever reach production , you guys remember how impossible was in our software architecture project which was hard to track any changes of schema without extreme audit tracking

2
we are using nextjs fourteen with react server components because it gives us the fastest possible page loads for the challenge descriptions while keeping the interactive parts like the monaco editor FAASt for the user

3 important
the core of the app is the event driven spine using kafka which is our biggest shift from a standard app architecture we use kafka for everything including sandbox session lifecycle because consumer groups give us the same reliable work queue semantics we would get from a dedicated task queue while also letting us replay events and decouple services kafka handles distributing heavy work across our go workers and if a worker dies mid job the consumer group rebalances and another worker picks it up

kafka is our source of truth for everything that has already happened once a challenge is solved kafka broadcasts that fact to the entire system so the progress service the notification service and the leaderboard all update at their own pace without ever slowing down the main user experience this decoupling is how we stay fast even when our backend services are under heavy load

for the data layer we chose neon postgres because of its serverless branching capability each time we open a pull request we can spin up a fresh copy of the entire database for testing without any extra cost or effort and prisma ensures all our queries are fully typed and safe

the most critical part is the sandbox security where we use go workers to manage containers on isolated node pools and we wrap everything in gvisor which is a user space kernel that provides a strong sandbox boundary so even if a user tries to run a malicious script they cannot touch our host system or other users data

we are also building with an observability first mindset using opentelemetry and the grafana stack because in a distributed system you are blind without tracing we need to be able to follow a single request from the kong api gateway all the way through kafka and into the progress service to understand exactly where a bottleneck or a failure is occurring

finally our ci cd process uses argocd for gitops which means our repository is the absolute truth for what is running in the kubernetes cluster we do not manually deploy things we just commit to the main branch and argo takes care of the rest ensuring our production environment always matches our code

this is not just a learning platform. setup is tough but it gives us the power to scale to thousands of users while maintaining a professional contributor experience for all of us





you might wonder why we are using kafka instead of direct api calls in our other projects the reason is scale and reliability at the engineering level.

this does work theres millions of spring , crud codebases like that in production right now,

 but here we are running actual infrastructure code which is dangerous and heavy if we used a simple api call and the connection dropped the whole job would be lost and we would have no way to know what happened,
 
 like we know everything is buil around failure in cloud , everything is assumed to fail, ephemeral and you have to design the system around it .

  kafka consumer groups give us a solid guarantee that every single sandbox job will be processed exactly as it should be even if a server restarts because uncommitted offsets are redelivered while also letting us build a truly decoupled system where new features like a leaderboard or an email service can be added later without ever touching the core code this is a professional engineering standard that you only see in high traffic production systems which is why we are implementing it now to ensure our platform is unbreakable from day one even if we reach tens of thousands of users simultaneously which is something a standard monolith simply cannot do without failing completely


  its fine to not know any of these. we will learn asa we go . the point of this is not to teach us how to write a yaml file , but it is about trying to understand real painpoints when something starts to scale and the importance of architecture . 
  how to choose best tools for the job we obviuosly might need to change something in he stack. that has always happened to me at least. no exception here probably. 



  what matters . * WE LITERALLY JUS START WITH BARE MINIMUM , seriously a working cached secure login form that has is secure , good ux is literally progress , a small app route/ /challenge  , a basic text editor for the coding interface that runs locally without crashing , even if we have to submit things manually for now it is progress . the goal is to incrementally improve the user experience and system design as we go , nothing crazy we . the whole complex dev stack will be apparent to us as we build it * 