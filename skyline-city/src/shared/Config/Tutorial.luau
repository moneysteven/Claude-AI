-- TUTORIAL CONFIG — the new-player walkthrough. Edit texts / order / reward here.
--
-- Step fields:
--   Id        unique id; systems call TutorialService:Advance(player, Id) when it is completed
--   Aliases   other ids that also complete the step (e.g. "OpenGarage" for BuyCar)
--   Title     short heading on the coach-mark card
--   Text      instruction text
--   Icon      emoji shown on the card
--   Manual    true = the card shows a "Let's go" button that completes the step
--   ClientReport  true = the client may report this step itself (purely cosmetic, e.g. opened the phone)
--   Requires  service name; if that service is not running, the step is skipped automatically
--   Tag       CollectionService tag; the server finds the nearest one and the client shows a GPS waypoint
--   WaypointLabel  label for the GPS waypoint

return {
	Reward = 2_500, -- cash paid once when the tutorial is completed (not paid when skipped)

	Steps = {
		{
			Id = "Welcome",
			Icon = "👋",
			Title = "Welcome to Skyline City!",
			Text = "Get a job, earn cash, buy a car and build your dream home. This quick guide shows you the basics.",
			Manual = true,
		},
		{
			Id = "OpenPhone",
			Icon = "📱",
			Title = "Open your phone",
			Text = "Your phone has the map, bank, garage and messages. Tap the 📱 button (or press P / ButtonY).",
			ClientReport = true,
			Requires = "PhoneService",
		},
		{
			Id = "ClockIn",
			Icon = "💼",
			Title = "Get a job",
			Text = "Follow the GPS to a job station and clock in. Pizza delivery is a great first job!",
			Requires = "JobService",
			Tag = "JobStation",
			WaypointLabel = "Job Station",
		},
		{
			Id = "FirstPay",
			Icon = "💵",
			Title = "Earn your first paycheck",
			Text = "Complete a job task to get paid. Higher job levels pay more.",
			Requires = "JobService",
		},
		{
			Id = "Deposit",
			Icon = "🏦",
			Title = "Bank your cash",
			Text = "Deposit cash at an ATM or with the Bank app on your phone. Savings earn interest while you play!",
			Tag = "ATM",
			WaypointLabel = "ATM",
		},
		{
			Id = "BuyCar",
			Aliases = { "OpenGarage" },
			Icon = "🚗",
			Title = "Get some wheels",
			Text = "Visit the dealership to buy a car, or open the Garage app on your phone to spawn one.",
			Requires = "VehicleService",
			Tag = "Dealership",
			WaypointLabel = "Dealership",
		},
		{
			Id = "EnterBuild",
			Icon = "🔨",
			Title = "Make it home",
			Text = "Go to your home and open Build mode to place furniture.",
			Requires = "BuildService",
		},
		{
			Id = "Done",
			Icon = "🎉",
			Title = "You're all set!",
			Text = "Tutorial complete. Enjoy Skyline City!",
		},
	},
}
