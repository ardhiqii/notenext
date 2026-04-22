package repositories

import "errors"


type repoErrors struct{
	NotFound error
	LimitReached error
}

var RepoErrors = repoErrors{
	NotFound: errors.New("not found"),
	LimitReached: errors.New("public notes limit reached, please sign in"),
}